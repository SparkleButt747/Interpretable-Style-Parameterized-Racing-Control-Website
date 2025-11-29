export type VehicleOption = {
  id: number;
  label: string;
  description: string;
  parameterPath: string;
  summary: {
    massKg?: number;
    lengthM?: number;
    widthM?: number;
  };
};

export type VeloxConfigBundle = {
  configRoot: string;
  parameterRoot: string;
  configFiles: Record<string, string>;
  parameterFiles: Record<string, string>;
  vehicles: VehicleOption[];
};
