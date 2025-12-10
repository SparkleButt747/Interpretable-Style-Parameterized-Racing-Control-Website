import { accelerationConstraints, steeringConstraints } from './constraints';
import { formulaLateral, formulaLateralCombined, formulaLongitudinal, formulaLongitudinalCombined } from './tireModel';
import { VehicleParameters } from './types';
import { vehicleDynamicsKsCog } from './vehicleKinematics';

const kGravity = 9.81;

export function vehicleDynamicsSTD(x: number[], uInit: number[], p: VehicleParameters, dt = 0.01): number[] {
  if (x.length !== 9 || uInit.length !== 2) {
    throw new Error('vehicle_dynamics_std: expected x.size()==9 and u_init.size()==2');
  }

  const lf = p.a;
  const lr = p.b;
  const lwb = p.a + p.b;
  const m = p.m;
  const I = p.I_z;

  const v_s = 0.2;
  const v_b = 0.05;
  const v_min = v_s / 2;

  const u = [
    steeringConstraints(x[2], uInit[0], p.steering),
    accelerationConstraints(x[3], uInit[1], p.longitudinal),
  ];

  let alpha_f = 0;
  let alpha_r = 0;
  if (x[3] > v_min) {
    alpha_f = Math.atan((x[3] * Math.sin(x[6]) + x[5] * lf) / (x[3] * Math.cos(x[6]))) - x[2];
    alpha_r = Math.atan((x[3] * Math.sin(x[6]) - x[5] * lr) / (x[3] * Math.cos(x[6])));
  }

  const F_zf = m * (-u[1] * p.h_s + kGravity * lr) / (lr + lf);
  const F_zr = m * (u[1] * p.h_s + kGravity * lf) / (lr + lf);

  const u_wf = Math.max(
    0,
    x[3] * Math.cos(x[6]) * Math.cos(x[2]) +
    (x[3] * Math.sin(x[6]) + p.a * x[5]) * Math.sin(x[2])
  );
  const u_wr = Math.max(0, x[3] * Math.cos(x[6]));

  const omega_f_state = Math.max(0, x[7]);
  const omega_r_state = Math.max(0, x[8]);

  const s_f = 1 - p.R_w * omega_f_state / Math.max(u_wf, v_min);
  const s_r = 1 - p.R_w * omega_r_state / Math.max(u_wr, v_min);

  const F0_xf = formulaLongitudinal(s_f, 0, F_zf, p.tire);
  const F0_xr = formulaLongitudinal(s_r, 0, F_zr, p.tire);

  const [F0_yf, mu_yf] = formulaLateral(alpha_f, 0, F_zf, p.tire);
  const [F0_yr, mu_yr] = formulaLateral(alpha_r, 0, F_zr, p.tire);

  const F_xf = formulaLongitudinalCombined(s_f, alpha_f, F0_xf, p.tire);
  const F_xr = formulaLongitudinalCombined(s_r, alpha_r, F0_xr, p.tire);

  const F_yf = formulaLateralCombined(s_f, alpha_f, 0, mu_yf, F_zf, F0_yf, p.tire);
  const F_yr = formulaLateralCombined(s_r, alpha_r, 0, mu_yr, F_zr, F0_yr, p.tire);

  let T_B = 0;
  let T_E = 0;
  if (u[1] > 0) {
    T_E = m * p.R_w * u[1];
  } else {
    T_B = m * p.R_w * u[1];
  }

  const d_v = (1 / m) *
    (-F_yf * Math.sin(x[2] - x[6]) +
      F_yr * Math.sin(x[6]) +
      F_xr * Math.cos(x[6]) +
      F_xf * Math.cos(x[2] - x[6]));

  const dd_psi = (1 / I) *
    (F_yf * Math.cos(x[2]) * lf -
      F_yr * lr +
      F_xf * Math.sin(x[2]) * lf);

  let d_beta = 0;
  if (x[3] > v_min) {
    d_beta = -x[5] +
      (1 / (m * x[3])) *
      (F_yf * Math.cos(x[2] - x[6]) +
        F_yr * Math.cos(x[6]) -
        F_xr * Math.sin(x[6]) +
        F_xf * Math.sin(x[2] - x[6]));
  }

  const front_negative = x[7] < 0;
  const rear_negative = x[8] < 0;

  let d_omega_f = 0;
  let d_omega_r = 0;
  if (!front_negative) {
    d_omega_f = (1 / p.I_y_w) *
      (-p.R_w * F_xf + p.T_sb * T_B + p.T_se * T_E);
    if (omega_f_state <= 0 && d_omega_f < 0) {
      d_omega_f = 0;
    }
  }
  if (!rear_negative) {
    d_omega_r = (1 / p.I_y_w) *
      (-p.R_w * F_xr + (1 - p.T_sb) * T_B + (1 - p.T_se) * T_E);
    if (omega_r_state <= 0 && d_omega_r < 0) {
      d_omega_r = 0;
    }
  }

  const xKs = [x[0], x[1], x[2], x[3], x[4]];
  const uArr = [u[0], u[1]];
  const fKs = vehicleDynamicsKsCog(xKs, uArr, p);

  const tanDelta = Math.tan(x[2]);
  const cosDelta = Math.cos(x[2]);
  const cosDeltaSq = cosDelta * cosDelta;
  const term = tanDelta * tanDelta * p.b / lwb;

  const d_beta_ks = (p.b * u[0]) /
    (lwb * cosDeltaSq * (1 + term * term));

  const dd_psi_ks = (1 / lwb) *
    (u[1] * Math.cos(x[6]) * Math.tan(x[2]) -
      x[3] * Math.sin(x[6]) * d_beta_ks * Math.tan(x[2]) +
      x[3] * Math.cos(x[6]) * u[0] / cosDeltaSq);

  const omega_f_clamped = front_negative ? 0 : omega_f_state;
  const omega_r_clamped = rear_negative ? 0 : omega_r_state;
  const inv_tau = 1 / 0.02;
  const d_omega_f_ks = inv_tau * (u_wf / p.R_w - omega_f_clamped);
  const d_omega_r_ks = inv_tau * (u_wr / p.R_w - omega_r_clamped);

  const w_std = 0.5 * (Math.tanh((x[3] - v_s) / v_b) + 1);
  const w_ks = 1 - w_std;

  const f = new Array<number>(9);
  f[0] = x[3] * Math.cos(x[6] + x[4]);
  f[1] = x[3] * Math.sin(x[6] + x[4]);
  f[2] = u[0];
  f[3] = w_std * d_v + w_ks * fKs[3];
  f[4] = w_std * x[5] + w_ks * fKs[4];
  f[5] = w_std * dd_psi + w_ks * dd_psi_ks;
  f[6] = w_std * d_beta + w_ks * d_beta_ks;
  f[7] = w_std * d_omega_f + w_ks * d_omega_f_ks;
  f[8] = w_std * d_omega_r + w_ks * d_omega_r_ks;
  return f;
}
