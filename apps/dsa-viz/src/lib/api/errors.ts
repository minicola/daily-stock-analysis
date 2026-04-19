export type ApiError = {
  status: number;
  code: string;
  message: string;
  url: string;
  detail?: unknown;
};
