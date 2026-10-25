export const projectHeatingPayment = ({
  required, requiredWithWoodConversion, convertedWood, availableFuel, fuelUsed,
}: {
  required: number
  requiredWithWoodConversion: number
  convertedWood: number
  availableFuel: number
  fuelUsed?: number
}) => {
  const canHeatWithWood = convertedWood > 0 && availableFuel > 0
  const effectiveRequired = canHeatWithWood ? requiredWithWoodConversion : required
  const activationFuel = canHeatWithWood && effectiveRequired < required ? 1 : 0
  const maximum = Math.min(Math.max(effectiveRequired, activationFuel), Math.max(0, availableFuel))
  const minimum = Math.min(convertedWood, maximum)
  const paid = Math.min(maximum, Math.max(minimum, fuelUsed ?? maximum))
  return { required: effectiveRequired, minimum, maximum, fuelUsed: paid, woodToFuel: minimum }
}
