#!/bin/zsh
# usage: tap.sh ix iy  (coords in a screenshot taken while iPhone Mirroring is focused: 424x806, window origin 57,38, scale 1)
agent-desktop focus-window --app "iPhone Mirroring" >/dev/null 2>&1; sleep 0.8
B=$(agent-desktop list-windows --app "iPhone Mirroring" | python3 -c "import sys,json;b=json.load(sys.stdin)['data'][0]['bounds'];print(b['x'],b['y'])")
x=$(python3 -c "b='$B'.split();print(round(float(b[0])+$1-57))"); y=$(python3 -c "b='$B'.split();print(round(float(b[1])+$2-38))")
for i in 1; do agent-desktop mouse-click --headed --xy $x,$y >/dev/null 2>&1; sleep 0.6; done; echo tapped $x,$y
