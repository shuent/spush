import { z } from "zod";

const envSecretSchema = z
  .object({
    env: z.string().min(1),
  })
  .strict();

const literalSecretSchema = z
  .object({
    value: z.string(),
  })
  .strict();

export const secretSchema = z.union([envSecretSchema, literalSecretSchema, z.string()]);

const privateKeySchema = z
  .object({
    path: z.string().min(1),
  })
  .strict();

const baseConnectionSchema = {
  host: z.string().min(1),
  user: z.string().min(1),
};

export const connectionSchema = z.discriminatedUnion("protocol", [
  z
    .object({
      protocol: z.literal("ftp"),
      ...baseConnectionSchema,
      port: z.number().int().positive().default(21),
      password: secretSchema,
    })
    .strict(),
  z
    .object({
      protocol: z.literal("ftps"),
      ...baseConnectionSchema,
      port: z.number().int().positive().default(21),
      password: secretSchema,
      reject_unauthorized: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      protocol: z.literal("sftp"),
      ...baseConnectionSchema,
      port: z.number().int().positive().default(22),
      password: secretSchema.optional(),
      private_key: privateKeySchema.optional(),
    })
    .strict(),
]);

export const rawConfigSchema = z
  .object({
    source: z.string().min(1),
    include: z.array(z.string().min(1)).default(["**/*"]),
    exclude: z.array(z.string().min(1)).default([".DS_Store", ".spush/**"]),
    connection: connectionSchema,
    remote_dir: z.string().min(1),
    url: z.string().url().optional(),
    env_file: z.string().min(1).optional(),
    manifest: z
      .object({
        path: z.string().min(1).default(".spush/manifest.json"),
      })
      .strict()
      .default({ path: ".spush/manifest.json" }),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.connection.protocol === "sftp" &&
      value.connection.password === undefined &&
      value.connection.private_key === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["connection", "password"],
        message: "password or private_key is required for sftp",
      });
    }
  });

export type SecretConfig = z.infer<typeof secretSchema>;
export type RawConnectionConfig = z.infer<typeof connectionSchema>;
export type RawConfig = z.infer<typeof rawConfigSchema>;

export type ResolvedConnectionConfig =
  | {
      protocol: "ftp";
      host: string;
      port: number;
      user: string;
      password: string;
    }
  | {
      protocol: "ftps";
      host: string;
      port: number;
      user: string;
      password: string;
      rejectUnauthorized: boolean;
    }
  | {
      protocol: "sftp";
      host: string;
      port: number;
      user: string;
      password?: string;
      privateKeyPath?: string;
    };

export type NormalizedConfig = {
  configPath: string;
  cwd: string;
  source: string;
  include: string[];
  exclude: string[];
  connection: ResolvedConnectionConfig;
  remoteDir: string;
  url?: string;
  manifestPath: string;
};
