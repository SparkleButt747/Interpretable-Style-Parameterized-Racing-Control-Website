export type TrackPoint = {
  x: number
  y: number
}

const pathFromPoints = (points: TrackPoint[]) =>
  points.reduce(
    (acc, point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`,
    ""
  )

export function makeLoop(points: TrackPoint[]) {
  if (!points.length) {
    return { closedPoints: [] as TrackPoint[], times: [] as number[], pathD: "" }
  }

  const closedPoints = [...points, points[0]]
  const segmentLengths = closedPoints.slice(0, -1).map((point, index) => {
    const next = closedPoints[index + 1]
    return Math.hypot(next.x - point.x, next.y - point.y)
  })
  const totalLength = segmentLengths.reduce((acc, length) => acc + length, 0) || 1

  let cumulative = 0
  const times = [0]

  segmentLengths.forEach((length, index) => {
    cumulative += length / totalLength
    times.push(index === segmentLengths.length - 1 ? 1 : cumulative)
  })

  return { closedPoints, times, pathD: pathFromPoints(closedPoints) }
}

export function offsetLoop(points: TrackPoint[], offset: number) {
  if (!points.length) return [] as TrackPoint[]
  const base = points.map((_, index) => points[(index + offset) % points.length])
  return [...base, base[0]]
}
