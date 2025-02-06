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
git clone https://github.com/pigeonman365/portfolio.git
cd portfolio/device_scan
Building the Docker Image
To build the Docker image for the Device Scan project, use the following command:

docker build -t device_scan /path/to/your/project/device_scan
Running the Docker Container
After building the Docker image, run the Docker container using the following command:

docker run -v /path/to/your/project/device_scan:/app device_scan
This command mounts the local device_scan directory to the /app directory inside the container, ensuring that the generated report is accessible on your host machine.

Usage
Once the Docker container is running, the device scan will execute, and the results will be printed to the terminal. The report will be saved to the same directory as ds.py on your host machine.
