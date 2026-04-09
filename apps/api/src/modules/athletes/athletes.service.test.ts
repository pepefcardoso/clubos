import { describe, it, expect } from "vitest";
import {
  DuplicateAthleteCpfError,
  AthleteNotFoundError,
} from "./athletes.service.js";

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
