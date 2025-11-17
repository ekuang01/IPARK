📍 iPark — Cloud-Powered Parking Web App

Built by Team MidByte | AWS re/Start Program (Per Scholas)

iPark is a cloud-based, community-driven parking web application designed to simplify how users find, report, and manage parking availability in real time. Built using modern AWS services and serverless architecture, iPark transforms a traditionally frustrating process into a smooth, data-driven experience.

🚗 Project Overview

Drivers often spend unnecessary time circling blocks in search of available parking. There is no free, community-based platform that provides real-time updates or allows users to interact directly with parking data.

iPark solves this by providing:

- A map-based interface showing real-time parking availability
- Color-coded street segments (green/yellow/red) updated by community input
- Serverless issue reporting that alerts administrators instantly
- A fully managed and scalable backend powered by AWS

This project was developed as part of the AWS re/Start Program, demonstrating real-world cloud engineering skills using industry-standard AWS services.

🏗️ Architecture Overview

iPark is built using a hybrid cloud architecture combining serverless components with managed compute services.

Frontend Deployment — Elastic Beanstalk

The main application is hosted on AWS Elastic Beanstalk, which automatically handles:

- EC2 provisioning
- Load balancing
- Auto scaling
- Health monitoring

This allows the team to focus on development rather than infrastructure maintenance.

Database Layer — DynamoDB

iPark uses Amazon DynamoDB to store:

- Parking availability data
- Street zone metadata
- Real-time updates from user interactions

Why DynamoDB?

- Low latency
- Serverless and cost-efficient
- Auto-scaling
- Flexible for JSON-style data

Issue Reporting Pipeline — API Gateway → Lambda → SNS

API Gateway

- Acts as the secure entry point for the “Report Issue” form
- Validates and routes incoming requests
- Removes the need to run our own API server

Lambda

- Processes and formats user input
- Performs basic validation
- Runs only when invoked (highly cost-efficient)

SNS

- Sends immediate email notifications to the team
- Offers built-in reliability, retries, and scalability

Security & Access Control — IAM

Used to:

- Provide individual AWS accounts for each team member
- Assign least-privilege roles across services
- Allow Beanstalk, Lambda, and other services to interact securely
- Maintain strong cloud security practices

🌐 Key Features

- 🗺️ Interactive map with zoom and street-level detail
- 🎨 Color-coded parking availability (green/yellow/red)
- ➕➖ Increment/Decrement street availability based on user parking actions
- 📝 Report Issue form with serverless backend processing
- 📩 Instant admin notifications via Amazon SNS
- ⚡ Serverless API workflow using API Gateway & Lambda
- 🛢️ DynamoDB-backed real-time data storage
- 🌩️ Scalable deployment on Elastic Beanstalk
- 🔐 Secure IAM roles and team access

🧰 Tech Stack

Frontend

- HTML / CSS / JavaScript
- Leaflet.js (interactive mapping)

Backend

- Node.js
- AWS Elastic Beanstalk
- AWS Lambda

AWS Services

- Elastic Beanstalk – Application deployment
- DynamoDB – NoSQL database
- API Gateway – API entry point
- Lambda – Serverless compute
- SNS – Email notifications
- IAM – Identity & access management
- CloudWatch – Monitoring and logs

👥 Team MidByte

A four-person development team from the AWS re/Start Program.

Team Member	Role

- Emily Kuang	Full-Stack Engineer / Lead
- Daniel Larco	Full-Stack Engineer
- Brandon Portillo	Cloud Engineer
- Sana Arshad	Database Engineer

Team Motto:

“Our impact isn’t measured by team size, but by the progress we build together — one byte at a time.”

📌 Summary

iPark demonstrates how serverless architecture, real-time data, and interactive mapping can come together to solve real community challenges. By leveraging AWS services such as Elastic Beanstalk, DynamoDB, Lambda, API Gateway, SNS, and IAM, our team built a complete cloud-native solution from the ground up.
