import CoreGraphics
import Foundation
// usage: swift scroll.swift x y dy   (dy<0 scrolls content up i.e. reveals lower items)
let a = CommandLine.arguments
let x = Double(a[1])!, y = Double(a[2])!, dy = Int32(a[3])!
CGWarpMouseCursorPosition(CGPoint(x: x, y: y))
usleep(200000)
for _ in 0..<12 {
  let e = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)!
  e.post(tap: .cghidEventTap)
  usleep(30000)
}
