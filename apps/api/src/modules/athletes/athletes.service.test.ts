import { describe, it, expect } from "vitest";
import {
  DuplicateAthleteCpfError,
  AthleteNotFoundError,
  createAthlete,
  getAthleteById,
  updateAthlete,
  listAthletes,
} from "./athletes.service.js";
import type { PrismaClient } from "../../../generated/prisma/index.js";

describe("DuplicateAthleteCpfError", () => {
  it("is an instance of Error", () => {
    const err = new DuplicateAthleteCpfError();
    expect(err).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new DuplicateAthleteCpfError().name).toBe(
      "DuplicateAthleteCpfError",
    );
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new DuplicateAthleteCpfError().message).toMatch(/CPF/);
  });

  it("can be caught via instanceof in a catch block", () => {
    const fn = () => {
      throw new DuplicateAthleteCpfError();
    };
    expect(() => fn()).toThrowError(DuplicateAthleteCpfError);
  });
});

describe("AthleteNotFoundError", () => {
  it("is an instance of Error", () => {
    expect(new AthleteNotFoundError()).toBeInstanceOf(Error);
  });

  it("has the correct name", () => {
    expect(new AthleteNotFoundError().name).toBe("AthleteNotFoundError");
  });

  it("carries a Portuguese user-facing message", () => {
    expect(new AthleteNotFoundError().message).toMatch(/Atleta/);
  });

  it("can be caught via instanceof in a catch block", () => {
    const fn = () => {
      throw new AthleteNotFoundError();
    };
    expect(() => fn()).toThrowError(AthleteNotFoundError);
  });
});

const STUB_PRISMA = {} as PrismaClient;

describe("service stubs (T-054 placeholder contracts)", () => {
  it("createAthlete rejects with 'Not implemented'", async () => {
    await expect(
      createAthlete(STUB_PRISMA, "club1", "actor1", {
        name: "Test",
        cpf: "12345678901",
        birthDate: "2000-01-01",
      }),
    ).rejects.toThrow("Not implemented");
  });

  it("getAthleteById rejects with 'Not implemented'", async () => {
    await expect(
      getAthleteById(STUB_PRISMA, "club1", "athlete1"),
    ).rejects.toThrow("Not implemented");
  });

  it("updateAthlete rejects with 'Not implemented'", async () => {
    await expect(
      updateAthlete(STUB_PRISMA, "club1", "actor1", "athlete1", { name: "X" }),
    ).rejects.toThrow("Not implemented");
  });

  it("listAthletes rejects with 'Not implemented'", async () => {
    await expect(
      listAthletes(STUB_PRISMA, "club1", { page: 1, limit: 20 }),
    ).rejects.toThrow("Not implemented");
  });
});
