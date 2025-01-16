export const orThrow = <T> (value:T, message:string) => {
  if (!value || value === '') {
    throw new Error(message);
  }
  return value;
};