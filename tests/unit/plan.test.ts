import { describe, expect, it } from 'vitest'
import { planDerivatives, WORKING_EDGE } from '../../server/pipeline/plan.ts'

const sizes = (width: number, height: number) =>
  Object.fromEntries(planDerivatives(width, height).map(d => [d.kind, [d.width, d.height]]))

describe('planDerivatives', () => {
  it('makes all four sizes from a large landscape photo', () => {
    expect(sizes(6000, 4000)).toEqual({
      thumb: [480, 320], square: [480, 480], medium: [1280, 853], large: [2560, 1707],
    })
  })
  it('measures medium and large by the long edge of a portrait photo', () => {
    expect(sizes(4000, 6000)).toEqual({
      thumb: [480, 720], square: [480, 480], medium: [853, 1280], large: [1707, 2560],
    })
  })
  it('never upscales: large stops at the original size', () => {
    expect(sizes(2000, 1500)).toEqual({
      thumb: [480, 360], square: [480, 480], medium: [1280, 960], large: [2000, 1500],
    })
  })
  it('skips large when it would be the same as medium', () => {
    expect(sizes(1000, 800)).toEqual({ thumb: [480, 384], square: [480, 480], medium: [1000, 800] })
    expect(sizes(1280, 720)).toEqual({ thumb: [480, 270], square: [480, 480], medium: [1280, 720] })
  })
  it('keeps a tiny photo at its own size everywhere', () => {
    expect(sizes(300, 200)).toEqual({ thumb: [300, 200], square: [200, 200], medium: [300, 200] })
  })
  it('handles a panorama and a very tall photo without a zero dimension', () => {
    expect(sizes(10000, 100).thumb).toEqual([480, 5])
    expect(sizes(3, 3000).thumb).toEqual([3, 3000])
    expect(sizes(2000, 1).medium).toEqual([1280, 1])
  })
  it('works from a raster no larger than the biggest derivative', () => {
    expect(WORKING_EDGE).toBe(2560)
  })
})
