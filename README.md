📍 About This Project — iPark

A serverless, cloud-powered parking web application built by Team MidByte

iPark is a community-driven parking management web application designed to make finding, tracking, and managing parking more efficient. Built through the AWS re/Start Program at Per Scholas, this project showcases how modern cloud architecture can transform everyday challenges—like circling endlessly for parking—into smooth, data-driven experiences.

Our team designed iPark to give users real-time visibility into parking availability, allow them to update parking conditions directly on the map, and submit issue reports that notify the team instantly. The result is a scalable, reliable, and easy-to-use system powered entirely by AWS cloud services.

🚗 Project Goals

- Provide a free, real-time, community-based parking solution

- Reduce wasted time, congestion, and frustration caused by parking guesswork

- Demonstrate how cloud-native architecture can support fast, scalable applications

- Build a full-stack project using industry-standard AWS services and best practices

🏗️ Architecture Overview

iPark is built using a blend of AWS managed compute and serverless services, creating a modern architecture that is scalable, cost-efficient, and simple to maintain.
Frontend Application — Elastic Beanstalk

The main web app is deployed on AWS Elastic Beanstalk, which handles provisioning EC2 instances, load balancing, auto scaling, and health monitoring.
This allowed the team to focus on development without managing servers manually.
Real-Time Parking Data — DynamoDB

All parking-related information—street availability, counts, color-coded status—is stored in Amazon DynamoDB.
We chose DynamoDB because it provides:

- Low-latency reads/writes

- Automatic scaling

- Serverless, maintenance-free operations

- A natural fit for JSON-style data

Issue Reporting System — API Gateway → Lambda → SNS

One of iPark’s key features is the user “Report Issue” button. This workflow is fully serverless:

API Gateway

- Acts as the secure entry point for user-submitted forms

- Validates and routes HTTP requests

- Eliminates the need to build our own API server

Lambda

- Processes and formats incoming report data

- Runs only when invoked (cost-efficient, no servers to manage)

SNS

- Immediately notifies the team via email

- Ensures reliable message delivery with automatic retries and scaling

This pipeline creates a lightweight, efficient reporting system with zero server overhead.
Security & Access Control — IAM

IAM was used throughout the project to:

- Give each team member their own secure AWS account

- Provide least-privilege access across all services

- Assign service roles (e.g., Beanstalk → DynamoDB access)

- Maintain consistent security best practices as the architecture expanded

🌐 Key Features

- Interactive map UI with zooming, street-level visualization

- Color-coded parking availability (green/yellow/red) updated in real time

- Increment/Decrement controls to mark parking spots as users park or leave

- Report Issue form with instant notifications via AWS SNS

- Fully serverless reporting pipeline

- Scalable backend database with DynamoDB

- Zero-downtime deployment through Elastic Beanstalk

- Secure multi-user access through IAM

👥 Team MidByte

This project was built by a four-person team as part of the AWS re/Start program:

- Emily Kuang – Full-Stack Engineer / Lead

- Daniel Larco – Full-Stack Engineer

- Brandon Portillo – Cloud Engineer

- Sana Arshad – Database Engineer

Our team motto:
“Our impact isn’t measured by team size, but by the progress we build together — one byte at a time.”

📌 Summary
iPark demonstrates how a small, dedicated team can design and deploy a fully functional cloud application using modern AWS services. From serverless notifications to real-time database updates to automated compute management, this project reflects real-world cloud engineering principles and hands-on full-stack development.
