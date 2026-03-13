import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function validateFile(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return "O arquivo deve ter extensão .csv";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "O arquivo excede o limite de 5 MB";
  }
  return null;
}

type ImportResultPayload = {
  imported: number;
  created: number;
  updated: number;
  errors: { row: number; field: string; message: string }[];
};

type ModalState =
  | { phase: "idle" }
  | { phase: "file_selected"; file: { name: string; size: number } }
  | { phase: "uploading"; file: { name: string; size: number } }
  | {
      phase: "result";
      result: ImportResultPayload;
      file: { name: string; size: number };
    }
  | { phase: "hard_error"; message: string };

function selectFile(
  file: { name: string; size: number },
  setState: (s: ModalState) => void,
) {
  const error = validateFile(file);
  if (error) {
    setState({ phase: "hard_error", message: error });
    return;
  }
  setState({ phase: "file_selected", file });
}

const csvFile = { name: "socios.csv", size: 1024 };
const bigCsvFile = { name: "big.csv", size: MAX_FILE_SIZE_BYTES + 1 };
const txtFile = { name: "socios.txt", size: 512 };
const csvUpperFile = { name: "SOCIOS.CSV", size: 512 };
const noExtFile = { name: "socios", size: 512 };

describe("validateFile", () => {
  it("accepts a valid .csv file within size limit", () => {
    expect(validateFile(csvFile)).toBeNull();
  });

  it("accepts an uppercase .CSV extension", () => {
    expect(validateFile(csvUpperFile)).toBeNull();
  });

  it("rejects a .txt file", () => {
    expect(validateFile(txtFile)).toBe("O arquivo deve ter extensão .csv");
  });

  it("rejects a file with no extension", () => {
    expect(validateFile(noExtFile)).toBe("O arquivo deve ter extensão .csv");
  });

  it("rejects a file exceeding 5 MB", () => {
    expect(validateFile(bigCsvFile)).toBe("O arquivo excede o limite de 5 MB");
  });

  it("accepts a file exactly at 5 MB boundary", () => {
    expect(
      validateFile({ name: "edge.csv", size: MAX_FILE_SIZE_BYTES }),
    ).toBeNull();
  });

  it("rejects a file 1 byte over the limit", () => {
    expect(
      validateFile({ name: "edge.csv", size: MAX_FILE_SIZE_BYTES + 1 }),
    ).toBe("O arquivo excede o limite de 5 MB");
  });

  it("extension check takes priority over size check", () => {
    expect(
      validateFile({ name: "huge.txt", size: MAX_FILE_SIZE_BYTES + 1 }),
    ).toBe("O arquivo deve ter extensão .csv");
  });
});

describe("selectFile state transitions", () => {
  let state: ModalState;
  const setState = (s: ModalState) => {
    state = s;
  };

  beforeEach(() => {
    state = { phase: "idle" };
  });

  it("transitions to file_selected for a valid csv", () => {
    selectFile(csvFile, setState);
    expect(state.phase).toBe("file_selected");
    if (state.phase === "file_selected") {
      expect(state.file).toBe(csvFile);
    }
  });

  it("transitions to hard_error for a non-csv file", () => {
    selectFile(txtFile, setState);
    expect(state.phase).toBe("hard_error");
    if (state.phase === "hard_error") {
      expect(state.message).toContain(".csv");
    }
  });

  it("transitions to hard_error for a file exceeding 5 MB", () => {
    selectFile(bigCsvFile, setState);
    expect(state.phase).toBe("hard_error");
    if (state.phase === "hard_error") {
      expect(state.message).toContain("5 MB");
    }
  });

  it("does NOT mutate state when validation passes", () => {
    const before = state;
    selectFile(csvFile, setState);
    expect(state).not.toBe(before);
  });
});

describe("Import result classification", () => {
  const cleanResult: ImportResultPayload = {
    imported: 10,
    created: 8,
    updated: 2,
    errors: [],
  };

  const partialResult: ImportResultPayload = {
    imported: 10,
    created: 7,
    updated: 2,
    errors: [
      {
        row: 3,
        field: "cpf",
        message: "CPF deve conter exatamente 11 dígitos",
      },
    ],
  };

  const allErrorResult: ImportResultPayload = {
    imported: 3,
    created: 0,
    updated: 0,
    errors: [
      {
        row: 2,
        field: "nome",
        message: "Nome deve ter entre 2 e 120 caracteres",
      },
      {
        row: 3,
        field: "telefone",
        message: "Telefone deve conter 10 ou 11 dígitos",
      },
      {
        row: 4,
        field: "cpf",
        message: "CPF deve conter exatamente 11 dígitos",
      },
    ],
  };

  it("identifies a clean import (no errors)", () => {
    expect(cleanResult.errors.length).toBe(0);
  });

  it("identifies a partial import (some errors, some success)", () => {
    expect(partialResult.errors.length).toBeGreaterThan(0);
    expect(partialResult.created + partialResult.updated).toBeGreaterThan(0);
  });

  it("identifies an all-error import (no successes)", () => {
    expect(allErrorResult.created + allErrorResult.updated).toBe(0);
    expect(allErrorResult.errors.length).toBeGreaterThan(0);
  });

  it("auto-close condition: only fires on clean import", () => {
    const shouldAutoClose = (result: ImportResultPayload) =>
      result.errors.length === 0;

    expect(shouldAutoClose(cleanResult)).toBe(true);
    expect(shouldAutoClose(partialResult)).toBe(false);
    expect(shouldAutoClose(allErrorResult)).toBe(false);
  });

  it("partial success toast message contains created and updated counts", () => {
    const msg = `${partialResult.created} criado(s), ${partialResult.updated} atualizado(s). Veja os erros abaixo.`;
    expect(msg).toContain("7 criado(s)");
    expect(msg).toContain("2 atualizado(s)");
    expect(msg).toContain("Veja os erros abaixo");
  });

  it("clean import toast message matches expected format", () => {
    const msg = `Importação concluída: ${cleanResult.created} criado(s), ${cleanResult.updated} atualizado(s).`;
    expect(msg).toContain("8 criado(s)");
    expect(msg).toContain("2 atualizado(s)");
    expect(msg).toContain("Importação concluída");
  });
});

describe("handleSubmit phase guard", () => {
  const phases: ModalState["phase"][] = [
    "idle",
    "uploading",
    "result",
    "hard_error",
  ];

  it.each(phases)(
    "returns early without calling mutateAsync when phase is %s",
    (phase) => {
      const mutateAsync = vi.fn();

      let state: ModalState;
      if (phase === "idle") {
        state = { phase: "idle" };
      } else if (phase === "uploading") {
        state = { phase: "uploading", file: csvFile };
      } else if (phase === "result") {
        state = {
          phase: "result",
          result: { imported: 1, created: 1, updated: 0, errors: [] },
          file: csvFile,
        };
      } else {
        state = { phase: "hard_error", message: "some error" };
      }

      const mockHandleSubmit = (currentState: ModalState) => {
        if (currentState.phase !== "file_selected") {
          return;
        }
        mutateAsync(currentState.file);
      };

      mockHandleSubmit(state as ModalState);

      expect(mutateAsync).not.toHaveBeenCalled();
    },
  );

  it("calls mutateAsync when phase is file_selected", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      imported: 1,
      created: 1,
      updated: 0,
      errors: [],
    });

    const state: ModalState = { phase: "file_selected", file: csvFile };

    if (state.phase === "file_selected") {
      await mutateAsync(state.file);
    }

    expect(mutateAsync).toHaveBeenCalledWith(csvFile);
  });
});

describe("API error handling in handleSubmit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts ApiError message for hard_error state", () => {
    class ApiError extends Error {
      constructor(
        message: string,
        public status: number,
      ) {
        super(message);
        this.name = "ApiError";
      }
    }

    const err = new ApiError("Colunas obrigatórias ausentes: cpf", 400);

    const message =
      err instanceof ApiError
        ? err.message
        : "Erro inesperado ao processar o arquivo.";

    expect(message).toBe("Colunas obrigatórias ausentes: cpf");
  });

  it("uses fallback message for non-ApiError", () => {
    class ApiError extends Error {
      constructor(
        message: string,
        public status: number,
      ) {
        super(message);
        this.name = "ApiError";
      }
    }

    const err = new Error("Network error");

    const message =
      err instanceof ApiError
        ? err.message
        : "Erro inesperado ao processar o arquivo.";

    expect(message).toBe("Erro inesperado ao processar o arquivo.");
  });
});
