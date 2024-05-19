const getBits = (number: number, start: number, end: number) => {
  if (start > end || start < 0 || end < 0) {
    throw new Error('Invalid start or end index');
  }

  const mask = ((1 << (end - start + 1)) - 1) << start;

  return (number & mask) >> start;
};

export { getBits };
