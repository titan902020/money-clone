#!/bin/zsh
# usage: snap.sh name  -> waits for screenshot
cd ~/Documents/Claude/money-clone/shots; rm -f $1.done; echo $1 > req
for i in $(seq 1 40); do [ -f $1.done ] && { echo shots/$1.png; exit 0; }; sleep 0.3; done; echo timeout
