#!/bin/zsh
# usage: tap.sh ix iy shots/x.png  (coords in that screenshot; phone body is centered: 300x650 px)
W=$(sips -g pixelWidth "$3" | awk '/pixelWidth/{print $2}'); H=$(sips -g pixelHeight "$3" | awk '/pixelHeight/{print $2}')
x=$(python3 -c "print(round(3707+($1-($W-300)/2)*1.04))"); y=$(python3 -c "print(round(254+($2-($H-650)/2)*1.0677))")
for i in 1 2; do agent-desktop mouse-click --headed --xy $x,$y >/dev/null 2>&1; sleep 0.6; done; echo tapped $x,$y
