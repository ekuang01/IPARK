// server.js
const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  DescribeTableCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const MAX_VALUE = Number(process.env.MAX_VALUE || 10); // upper cap
const TABLE_NAME = process.env.TABLE_NAME || "WayConfig";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serves index.html, data.json, etc.

// ---------- DynamoDB client: AWS in prod, local only if DDB_ENDPOINT is set ----------
const clientConfig = {
  region: process.env.AWS_REGION || "us-east-1",
};

if (process.env.DDB_ENDPOINT) {
  // Local/dev mode (e.g., DynamoDB Local)
  clientConfig.endpoint = process.env.DDB_ENDPOINT;
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
  };
  console.log("Using custom DDB endpoint:", clientConfig.endpoint);
} else {
  // In AWS: use default credentials provider chain (EB/EC2 instance role)
  console.log("Using AWS default credentials provider chain (instance role).");
}

const ddb = new DynamoDBClient(clientConfig);

// ===== Schema discovery (cached) =====
let _tableMeta = null;
async function getTableMeta() {
  if (_tableMeta) return _tableMeta;

  const { Table } = await ddb.send(
    new DescribeTableCommand({ TableName: TABLE_NAME })
  );

  const schema = {};
  for (const ks of Table.KeySchema) schema[ks.KeyType] = ks.AttributeName; // HASH/RANGE -> name
  const types = {};
  for (const ad of Table.AttributeDefinitions) types[ad.AttributeName] = ad.AttributeType; // S/N/B

  _tableMeta = { schema, types };
  return _tableMeta;
}

// Build Key object for UpdateItem from request body (key/wayId/id)
function buildKeyObject(meta, body) {
  const { schema, types } = meta;
  const pick = (...names) => {
    for (const n of names)
      if (body[n] !== undefined && body[n] !== null && body[n] !== "")
        return body[n];
    return undefined;
  };

  const keyObj = {};
  const hashName = schema.HASH;
  const rangeName = schema.RANGE;

  const candidates = {
    wayId: pick("wayId", "id"),
    id: pick("id", "wayId"),
    key: pick("key"),
  };

  if (hashName) {
    const t = types[hashName]; // 'S' | 'N'
    let v =
      candidates[hashName] ?? candidates.key ?? candidates.wayId ?? candidates.id;
    if (v === undefined) return null;
    if (t === "N") v = String(Number(v));
    keyObj[hashName] = t === "S" ? { S: String(v) } : { N: String(v) };
  }

  if (rangeName) {
    const t = types[rangeName];
    let v =
      candidates[rangeName] ??
      (rangeName !== hashName ? candidates.id : undefined);
    if (v === undefined) return null;
    if (t === "N") v = String(Number(v));
    keyObj[rangeName] = t === "S" ? { S: String(v) } : { N: String(v) };
  }

  return keyObj;
}

// ===== Startup seed from public/data.json (safe create-only) =====
async function extractWayIdsAndNamesFromGeoJSON(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const gj = JSON.parse(raw);
    const feats =
      gj?.type === "FeatureCollection" ? gj.features || [] : [];
    const results = [];

    for (const f of feats) {
      const props = f.properties || {};
      let wayId = NaN;

      if (props.osm_id && Number.isFinite(+props.osm_id)) wayId = +props.osm_id;
      else if (props["@id"]) {
        const m = String(props["@id"]).match(/way\/(\d+)/i);
        if (m) wayId = +m[1];
      } else if (typeof f.id === "string") {
        const m2 = f.id.match(/way\/(\d+)/i);
        if (m2) wayId = +m2[1];
      } else if (Number.isFinite(f.id)) {
        wayId = +f.id;
      }

      if (Number.isFinite(wayId)) {
        const name = (props.name && String(props.name)) || `Way ${wayId}`;
        results.push({ wayId, name });
      }
    }
    return results; // [{wayId, name}, ...]
  } catch (e) {
    console.warn("Seed: could not read/parse data.json:", e?.message || e);
    return [];
  }
}

async function getExistingWayIds() {
  const data = await ddb.send(
    new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: "#wid, #id",
      ExpressionAttributeNames: { "#wid": "wayId", "#id": "id" },
    })
  );
  const ids = new Set();
  for (const i of data.Items || []) {
    const numeric = Number(
      i.wayId?.N ?? i.id?.N ?? i.id?.S ?? NaN
    );
    if (Number.isFinite(numeric)) ids.add(numeric);
  }
  return ids;
}

function buildSeedItem(meta, wayId, label) {
  const { schema, types } = meta;
  const item = {
    // Always include these attributes regardless of PK
    wayId: { N: String(wayId) },
    key: { S: `way-${wayId}` },
    label: { S: label || `Way ${wayId}` },
    value: { N: "0" },
  };

  // Ensure PK attributes are present with correct types
  if (schema.HASH) {
    const hName = schema.HASH;
    const hType = types[hName];
    const hVal = hType === "N" ? String(wayId) : `way-${wayId}`;
    item[hName] = hType === "N" ? { N: hVal } : { S: hVal };
  }
  if (schema.RANGE) {
    const rName = schema.RANGE;
    const rType = types[rName];
    const rVal = rType === "N" ? String(wayId) : `way-${wayId}`;
    item[rName] = rType === "N" ? { N: rVal } : { S: rVal };
  }

  return item;
}

async function seedMissingFromGeoJSON() {
  const meta = await getTableMeta();
  const pairs = await extractWayIdsAndNamesFromGeoJSON(
    path.join(__dirname, "public", "data.json")
  );
  if (!pairs.length) {
    console.log("Seed: no wayIds found in data.json (skip).");
    return;
  }

  const existing = await getExistingWayIds();
  const missing = pairs.filter((p) => !existing.has(p.wayId));

  if (!missing.length) {
    console.log("Seed: no missing ids (WayConfig already aligned).");
    return;
  }

  console.log(`Seed: creating ${missing.length} new WayConfig item(s)...`);

  const hashName = (await getTableMeta()).schema.HASH;
  const condExpr = `attribute_not_exists(#h)`;
  const exprNames = { "#h": hashName };

  for (const { wayId, name } of missing) {
    const Item = buildSeedItem(meta, wayId, name);
    try {
      await ddb.send(
        new PutItemCommand({
          TableName: TABLE_NAME,
          Item,
          ConditionExpression: condExpr,
          ExpressionAttributeNames: exprNames,
        })
      );
    } catch (e) {
      // If another process created it, or schema mismatch — skip gracefully
      console.warn(
        `Seed: skip wayId=${wayId} ->`,
        e?.name || e?.message || e
      );
    }
  }

  console.log("Seed: done.");
}

// Fire-and-forget seeding (server can run even if table starts empty)
seedMissingFromGeoJSON().catch((err) => console.error("Seed error:", err));

// ===== API =====

// Healthcheck (useful for EB)
app.get("/health", (req, res) => res.status(200).send("OK"));

// GET /config — return ONLY { key, id, label, value } (no color)
app.get("/config", async (req, res) => {
  try {
    const data = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
    const items = (data.Items || []).map((i) => ({
      key: i.key?.S ?? i.key?.N ?? null,
      id: Number(i.wayId?.N ?? i.id?.N ?? i.id?.S ?? 0),
      label: i.label?.S ?? i.label?.N ?? "",
      value: Number(i.value?.N ?? 0),
    }));
    res.json(items);
  } catch (err) {
    console.error("Error loading config:", err);
    res.status(500).json({ error: "Failed to load config" });
  }
});

// POST /value — delta ∈ {+1, -1}; enforce 0..MAX_VALUE; returns { key, id, value }
app.post("/value", async (req, res) => {
  try {
    const { key, wayId, id, delta } = req.body;
    const d = Number(delta);
    if (!Number.isInteger(d) || ![1, -1].includes(d)) {
      return res.status(400).json({ error: "delta must be +1 or -1" });
    }

    const meta = await getTableMeta();
    const Key = buildKeyObject(meta, { key, wayId, id });
    if (!Key) {
      return res.status(400).json({
        error:
          "Missing required key attributes for this table. Include one or more of: key (string), wayId (number), id (number).",
      });
    }

    const isInc = d > 0;

    const exprValues = {
      ":d": { N: String(d) }, // +1 or -1
      ":zero": { N: "0" },
    };

    let condition;
    if (isInc) {
      condition = "(attribute_not_exists(#v) OR #v < :max)"; // allow first set or inc if below max
      exprValues[":max"] = { N: String(MAX_VALUE) }; // include :max ONLY for increment
    } else {
      condition = "(attribute_exists(#v) AND #v > :zero)"; // only dec if value > 0
    }

    const out = await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key,
        UpdateExpression: "SET #v = if_not_exists(#v, :zero) + :d",
        ConditionExpression: condition,
        ExpressionAttributeNames: { "#v": "value" },
        ExpressionAttributeValues: exprValues,
        ReturnValues: "ALL_NEW",
      })
    );

    const a = out.Attributes || {};
    const payload = {
      key: a.key?.S ?? a.key?.N ?? null,
      id: Number(a.wayId?.N ?? a.id?.N ?? a.id?.S ?? 0),
      value: Number(a.value?.N ?? 0),
    };
    res.json(payload);
  } catch (err) {
    if (String(err?.name) === "ConditionalCheckFailedException") {
      const d = Number(req.body?.delta);
      return res.status(400).json({
        error: d > 0 ? `Street is full (max ${MAX_VALUE}).` : "Value cannot go below 0",
      });
    }
    console.error("Error updating value:", err);
    res.status(500).json({ error: "Failed to update value" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});
