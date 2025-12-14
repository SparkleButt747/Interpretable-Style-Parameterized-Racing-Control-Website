export function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function axpy(a: number, x: Float64Array, y: Float64Array): void {
  for (let i = 0; i < x.length; i += 1) {
    y[i] += a * x[i];
  }
}

export function scale(v: Float64Array, s: number): void {
  for (let i = 0; i < v.length; i += 1) {
    v[i] *= s;
  }
}

export function copy(src: Float64Array, dst: Float64Array): void {
  for (let i = 0; i < src.length; i += 1) {
    dst[i] = src[i];
  }
}

export function matVec(A: Float64Array[], x: Float64Array, out: Float64Array): void {
  for (let i = 0; i < A.length; i += 1) {
    const row = A[i];
    let sum = 0;
    for (let j = 0; j < row.length; j += 1) {
      sum += row[j] * x[j];
    }
    out[i] = sum;
  }
}

export function choleskyDecompose(A: Float64Array[]): Float64Array[] | null {
  const n = A.length;
  const L: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = A[i][j];
      for (let k = 0; k < j; k += 1) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        if (sum <= 1e-12) {
          return null;
        }
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

export function choleskySolve(L: Float64Array[], b: Float64Array, out: Float64Array): void {
  const n = L.length;
  const y = new Float64Array(n);
  // Forward
  for (let i = 0; i < n; i += 1) {
    let sum = b[i];
    for (let k = 0; k < i; k += 1) {
      sum -= L[i][k] * y[k];
    }
    y[i] = sum / L[i][i];
  }
  // Backward
  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = y[i];
    for (let k = i + 1; k < n; k += 1) {
      sum -= L[k][i] * out[k];
    }
    out[i] = sum / L[i][i];
  }
}
