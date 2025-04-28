#!/bin/bash

docker build -t mesh-dc-bot .
docker run -d mesh-dc-bot 