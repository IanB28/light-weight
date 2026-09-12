/** Returns the age at `referenceDate`, or null when the birth date is invalid. */
export function calculateAge(
  birthDate: string,
  referenceDate: Date = new Date()
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || Number.isNaN(referenceDate.getTime())) return null;

  const [year, month, day] = birthDate.split('-').map(Number);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) return null;

  const referenceYear = referenceDate.getFullYear();
  const referenceMonth = referenceDate.getMonth() + 1;
  const referenceDay = referenceDate.getDate();
  if (
    year > referenceYear ||
    (year === referenceYear && (month > referenceMonth || (month === referenceMonth && day > referenceDay)))
  ) return null;

  let age = referenceYear - year;
  if (referenceMonth < month || (referenceMonth === month && referenceDay < day)) age -= 1;
  return age;
}
