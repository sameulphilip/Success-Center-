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
    const centerShare = Math.round(net * (centerAmt / fee) * 100) / 100;
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
  const teacher = feeAmount - centerAmount;
  return Math.round((teacher / feeAmount) * 10000) / 100;
}
