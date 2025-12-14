MPCC integration notes
======================

State and inputs (STD model, from `velox/models/dynamics.ts`):
- x[0] = x position [m]
- x[1] = y position [m]
- x[2] = front steering angle `delta` [rad]
- x[3] = speed `v` [m/s]
- x[4] = heading `psi` [rad]
- x[5] = yaw rate `r` [rad/s]
- x[6] = body slip `beta` [rad]
- x[7] = front wheel angular speed `omega_f` [rad/s]
- x[8] = rear wheel angular speed `omega_r` [rad/s]

Control inputs (u):
- u[0] = steering rate command `delta_dot` [rad/s] (clamped by steering constraints)
- u[1] = longitudinal acceleration command [m/s^2] (clamped by longitudinal constraints)

Initial MPCC timing (F1TENTH 2019 style):
- Solve rate: 20–30 Hz target (start at 20 Hz if worker overhead is high).
- Horizon: 1.5–2.0 s (start with 1.6 s).
- Discretization: 0.05 s step (32 steps for a 1.6 s horizon).

Planned architecture:
- Worker-based MPCC (osqp-wasm) to avoid blocking the UI.
- Shared track bundle: centerline spline + arc length + width profile + curvature + fast projection.
- Prediction model: linearization of STD around last state/reference.
- Cost: progress, lateral/heading error to centerline, input magnitude/rate, slack for track bounds.
- Outputs: steering rate + accel for next sim step, plus predicted trajectory for UI overlay.
