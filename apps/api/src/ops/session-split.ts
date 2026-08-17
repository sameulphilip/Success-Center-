type Money = number | string | { toString(): string } | null | undefined;

function toNum(v: Money) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Center cut is a per-student amount; teacher gets the remainder. */
export function splitSessionNet(opts: {
  net: Money;
  feeAmount: Money;
  teacherPercent?: Money;
  centerAmount?: Money;
  settledTeacherAmount?: Money;
  settledCenterAmount?: Money;
}) {
  const settledT = toNum(opts.settledTeacherAmount);
  const settledC = toNum(opts.settledCenterAmount);
  if (settledT != null && settledC != null) {
    return { teacherShare: settledT, centerShare: settledC };
  }
  const net = Math.round((toNum(opts.net) || 0) * 100) / 100;
  const fee = toNum(opts.feeAmount) || 0;
  const centerAmt = toNum(opts.centerAmount);

  if (centerAmt != null && fee > 0) {
    const ratio = Math.min(1, centerAmt / fee);
    const centerShare = Math.round(net * ratio * 100) / 100;
    const teacherShare = Math.round((net - centerShare) * 100) / 100;
    return { teacherShare, centerShare };
  }

  const pct = (toNum(opts.teacherPercent) || 0) / 100;
  const teacherShare = Math.round(net * pct * 100) / 100;
  const centerShare = Math.round((net - teacherShare) * 100) / 100;
  return { teacherShare, centerShare };
}

export function teacherPercentFromCenter(feeAmount: number, centerAmount: number) {
  if (feeAmount <= 0) return 0;
  const teacher = Math.max(0, feeAmount - centerAmount);
  return Math.round((teacher / feeAmount) * 10000) / 100;
}

/** Extra revenue: center cut is absolute and may be larger than price (price can be 0). */
export function splitExtraRevenue(
  unitPrice: number,
  centerAmount: number,
  qty = 1,
) {
  const price = Math.max(0, Number(unitPrice) || 0);
  const center = Math.max(0, Number(centerAmount) || 0);
  const teacherUnit = Math.max(0, price - center);
  return {
    teacherShare: Math.round(teacherUnit * qty * 100) / 100,
    centerShare: Math.round(center * qty * 100) / 100,
  };
}
