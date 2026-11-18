#!/bin/zsh
# usage: tour.sh name:x:y ...   (x,y in screenshot coords of iPhone Mirroring window; converts to screen coords)
D=~/Documents/Claude/money-clone/shots
for st in "$@"; do
  n=${st%%:*}; r=${st#*:}; x=${r%%:*}; y=${r#*:}
  if [ "$x" != "-" ]; then agent-desktop mouse-click --headed --xy $((3651+x)),$((198+y)) >/dev/null 2>&1; sleep 2.2; fi
  agent-desktop screenshot --app "iPhone Mirroring" $D/$n.png >/dev/null 2>&1
  echo "shot $n"
done
