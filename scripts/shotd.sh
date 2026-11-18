#!/bin/zsh
# screenshot daemon: write a name into shots/req, get shots/<name>.png
cd ~/Documents/Claude/money-clone
while true; do
  if [ -f shots/req ]; then n=$(cat shots/req); rm -f shots/req; agent-desktop screenshot --app "iPhone Mirroring" shots/$n.png >/dev/null 2>&1; touch shots/$n.done; fi
  sleep 0.3
done
