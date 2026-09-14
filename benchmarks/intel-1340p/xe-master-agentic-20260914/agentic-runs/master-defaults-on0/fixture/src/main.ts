export function normalize(x:{retries?:number,label?:string,enabled?:boolean}): {retries: number, label: string, enabled: boolean} {
  const retries = x.retries !== undefined ? x.retries : 3;
  if (typeof retries === 'number' && (retries < 0 || !Number.isInteger(retries) || !Number.isFinite(retries))) {
    throw new RangeError('retries must be a non-negative integer');
  }
  return {
    retries: retries,
    label: x.label !== undefined ? x.label : "job",
    enabled: x.enabled !== undefined ? x.enabled : true,
  };
}