import { z } from "zod";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "phone must contain only digits")
  .refine(
    (phone) => /^55\d{10,11}$/.test(phone),
    "phone must include country code 55 and a valid brazilian number",
  )
  .refine((phone) => {
    const ddd = Number(phone.slice(2, 4));
    return ddd >= 11 && ddd <= 99;
  }, "phone has an invalid DDD")
  .refine((phone) => {
    const subscriber = phone.slice(4);
    return (
      (subscriber.length === 8 || subscriber.length === 9) &&
      /^[2-9]\d+$/.test(subscriber)
    );
  }, "phone has an invalid subscriber number");

export const articulatorSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
});

export const syncArticulatorsBodySchema = z.object({
  articulators: z.array(articulatorSchema),
});

export type ArticulatorInput = z.infer<typeof articulatorSchema>;
export type SyncArticulatorsBody = z.infer<typeof syncArticulatorsBodySchema>;
