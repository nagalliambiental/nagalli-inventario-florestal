import { getConfig, setConfig, deleteConfig } from "../db/database";
import { hashPin, randomSalt } from "./hash";

const PIN_KEY = "pin_hash";

export async function isPinSet(): Promise<boolean> {
  return (await getConfig(PIN_KEY)) !== null;
}

export async function setPin(pin: string): Promise<void> {
  const salt = randomSalt();
  await setConfig(PIN_KEY, `${salt}:${hashPin(pin, salt)}`);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await getConfig(PIN_KEY);
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return hashPin(pin, salt) === hash;
}

export async function removePin(): Promise<void> {
  await deleteConfig(PIN_KEY);
}
