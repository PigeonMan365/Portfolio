# Device Scan Project

## Overview
The Device Scan project is a tool designed to scan and report on various devices connected to a network. This project is containerized using Docker to ensure easy deployment and consistent environments.

## Features
- Scans network devices
- Generates detailed reports
- Easy to deploy using Docker

## Prerequisites
- Docker installed on your machine. You can download Docker from the official Docker website.

## Getting Started

### Cloning the Repository
First, clone the repository to your local machine and navigate to the project directory:
```bash
git clone https://github.com/PigeonMan365/Portfolio.git
cd Portfolio/device_scan
Building the Docker Image
To build the Docker image for the Device Scan project, use the following command:

docker build -t device_scan .
Running the Docker Container
After building the Docker image, run the Docker container using the following command:

docker run -p 3000:3000 device_scan
This command maps port 3000 of your local machine to port 3000 of the Docker container. Adjust the port numbers if your application uses a different port.

Usage
Once the Docker container is running, you can access the application by navigating to http://localhost:3000 in your web browser.
