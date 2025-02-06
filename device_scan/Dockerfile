# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /device_scan

# Copy the current directory contents into the container at /device_scan
COPY . /device_scan

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Install ufw
RUN apt-get update && apt-get install -y ufw

# Run the script when the container launches
CMD ["python", "ds.py"]
