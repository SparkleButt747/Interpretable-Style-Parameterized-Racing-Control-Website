export enum ModelType {
  ST = 'ST',
  STD = 'STD',
}

export enum ControlMode {
  Keyboard = 'Keyboard',
  Direct = 'Direct',
}

export interface ModelTimingInfo {
  nominal_dt: number;
  max_dt: number;
}
