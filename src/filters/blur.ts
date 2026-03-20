import type { Filter, Kernel5x5 } from "../types.js";
import { convolve } from "./convolve.js";

const GAUSSIAN_5X5: Kernel5x5 = [
  1, 4,  7,  4,  1,
  4, 16, 26, 16,  4,
  7, 26, 41, 26,  7,
  4, 16, 26, 16,  4,
  1, 4,  7,  4,  1,
];

/** Applies a 5x5 Gaussian blur. */
export function blur(): Filter {
  return convolve({ kernel: GAUSSIAN_5X5 });
}
