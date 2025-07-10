#!/bin/bash
git pull
docker system prune -af
docker build -t mesh-dc-bot .
docker run -d mesh-dc-bot 