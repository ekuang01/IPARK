
// library:
const {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  DescribeTableCommand,
  GetItemCommand,
} = require("@aws-sdk/client-dynamodb");

const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serves index.html in /public

// below your app.use(...) lines:
const ddb = new DynamoDBClient({
  region: "us-east-1",
  endpoint: "http://localhost:8000",                // DynamoDB Local
  credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" } // required, ignored locally
});

// GET /config — returns array shaped like your WAY_CONFIG
app.get("/config", async (req, res) => {
  try {
    const data = await ddb.send(new ScanCommand({ TableName: "WayConfig" }));
    const items = (data.Items || []).map(i => ({
      key:    i.key.S,
      id:     Number(i.wayId.N),     // your "id" (wayId)
      color:  i.color.S,
      label:  i.label.S,
      value:  Number(i.value.N)
    }));
    res.json(items);
  } catch (err) {
    console.error("Error loading config from DynamoDB:", err);
    res.status(500).json({ error: "Failed to load config" });
  }
});

// Save location
app.post("/save-location", async (req, res) => {
  const { id, latitude, longitude } = req.body;

  let data = [];
  try {
    const file = await fs.readFile("locations.json", "utf-8");
    data = JSON.parse(file);
  } catch {
    console.log("No existing locations.json, starting fresh.");
  }

  // Replace existing entry for same user
  data = data.filter(loc => loc.id !== id);
  data.push({ id, latitude, longitude, timestamp: new Date().toISOString() });

  await fs.writeFile("locations.json", JSON.stringify(data, null, 2));
  res.json({ status: "ok" });
});

// Remove location
app.post("/remove-location", async (req, res) => {
  const { id } = req.body;

  let data = [];
  try {
    const file = await fs.readFile("locations.json", "utf-8");
    data = JSON.parse(file);
  } catch {
    console.log("No existing locations.json, nothing to remove.");
  }

  data = data.filter(loc => loc.id !== id);
  await fs.writeFile("locations.json", JSON.stringify(data, null, 2));

  res.json({ status: "removed" });
});

// Get all locations
app.get("/get-locations", async (req, res) => {
  try {
    const file = await fs.readFile("locations.json", "utf-8");
    res.json(JSON.parse(file));
  } catch {
    res.json([]);
  }
});

// POST /value — increment/decrement a street's value by delta

async function describeKeySchema() {
  const { Table } = await ddb.send(new DescribeTableCommand({ TableName: "WayConfig" }));
  // e.g. [{AttributeName:'wayId',KeyType:'HASH'},{AttributeName:'id',KeyType:'RANGE'}]
  const schema = {};
  for (const ks of Table.KeySchema) {
    schema[ks.KeyType] = ks.AttributeName; // HASH -> name, RANGE -> name
  }
  // find attribute types (S/N) from AttributeDefinitions
  const types = {};
  for (const ad of Table.AttributeDefinitions) {
    types[ad.AttributeName] = ad.AttributeType; // 'S' | 'N' | 'B'
  }
  return { schema, types }; // { schema: {HASH:'...', RANGE:'...'}, types: { attrName:'S'|'N' } }
}

// Build a DynamoDB Key object by trying multiple candidate fields from the request
function buildKeyObject({ schema, types }, body) {
  const keyObj = {};

  // helper: pick value from body by possible aliases
  const pick = (...names) => {
    for (const n of names) {
      if (body[n] !== undefined && body[n] !== null && body[n] !== "") return body[n];
    }
    return undefined;
  };

  const hashName = schema.HASH;
  const rangeName = schema.RANGE; // may be undefined

  // try to map known aliases
  const candidates = {
    wayId: pick("wayId", "id"),      // number
    id:    pick("id", "wayId"),      // number
    key:   pick("key"),              // string
  };

  // set HASH
  if (hashName) {
    const t = types[hashName]; // 'S' or 'N'
    let v = candidates[hashName] ?? candidates.key ?? candidates.wayId ?? candidates.id;
    if (v === undefined) return null;
    if (t === "N") v = String(Number(v));
    keyObj[hashName] = t === "S" ? { S: String(v) } : { N: String(v) };
  }

  // set RANGE if present
  if (rangeName) {
    const t = types[rangeName];
    let v = candidates[rangeName] ?? (rangeName !== hashName ? candidates.id : undefined);
    if (v === undefined) return null;
    if (t === "N") v = String(Number(v));
    keyObj[rangeName] = t === "S" ? { S: String(v) } : { N: String(v) };
  }

  return keyObj;
}

app.post("/value", async (req, res) => {
  try {
    const { key, wayId, id, delta } = req.body;
    const d = Number(delta);
    if (!Number.isInteger(d)) return res.status(400).json({ error: "delta (integer) is required" });

    const meta = await describeKeySchema();
    let dynamoKey = buildKeyObject(meta, { key, wayId, id });
    if (!dynamoKey) {
      return res.status(400).json({
        error: "Missing required key attributes for this table. Include one or more of: key (string), wayId (number), id (number).",
      });
    }

    // Try the update with the key(s) we built
    async function doUpdateWithKey(Key) {
      const out = await ddb.send(new UpdateItemCommand({
        TableName: "WayConfig",
        Key,
        UpdateExpression: "SET #v = if_not_exists(#v, :zero) + :d",
        ExpressionAttributeNames: { "#v": "value" },
        ExpressionAttributeValues: {
          ":d":    { N: String(d) },
          ":zero": { N: "0" },
        },
        ReturnValues: "ALL_NEW",
      }));
      const a = out.Attributes;
      return {
        key:   a.key?.S ?? a.key?.N ?? null,
        id:    Number(a.wayId?.N ?? a.id?.N ?? a.id?.S ?? a.wayId?.S ?? 0),
        color: a.color?.S ?? null,
        label: a.label?.S ?? null,
        value: Number(a.value?.N ?? 0),
      };
    }

    try {
      // 1st attempt with provided IDs
      const updated = await doUpdateWithKey(dynamoKey);
      return res.json(updated);
    } catch (e1) {
      // If there is a RANGE key and we only provided HASH, try finding the full key by scanning on 'key' string
      const needsRange = Boolean(meta.schema.RANGE);
      const providedRange = meta.schema.RANGE && dynamoKey[meta.schema.RANGE];
      if (needsRange && !providedRange && typeof key === "string") {
        // find the full item by scanning the 'key' attribute
        const scan = await ddb.send(new ScanCommand({
          TableName: "WayConfig",
          FilterExpression: "#k = :kv",
          ExpressionAttributeNames: { "#k": "key" },
          ExpressionAttributeValues: { ":kv": { S: key } },
          Limit: 1,
        }));
        const item = (scan.Items || [])[0];
        if (item) {
          // rebuild a proper Key from the found item
          const correctKey = {};
          for (const kt of ["HASH", "RANGE"]) {
            const attr = meta.schema[kt];
            if (!attr) continue;
            const type = meta.types[attr]; // 'S' or 'N'
            const cell = item[attr];
            if (!cell) continue;
            correctKey[attr] = type === "S" ? { S: cell.S ?? String(cell.N) } : { N: cell.N ?? String(cell.S) };
          }
          const updated = await doUpdateWithKey(correctKey);
          return res.json(updated);
        }
      }
      throw e1; // rethrow if we couldn't recover
    }
  } catch (err) {
    console.error("Error updating value:", err);
    res.status(500).json({ error: "Failed to update value", detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
