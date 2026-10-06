import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Schemas } from "@/lib/api/client";
import { uploadMedia } from "@/lib/admin/media";
import { renderWithAdmin } from "@/tests/admin";

import { ImageUpload } from "./ImageUpload";

vi.mock("@/lib/admin/media", () => ({ uploadMedia: vi.fn(), MAX_UPLOAD_MB: 15 }));

const media: Schemas["MediaOut"] = {
  id: "m1",
  url: "/media/images/a/original.webp",
  srcset: { "320": "/media/images/a/320.webp" },
  width: 1200,
  height: 800,
};

function Harness({ initial = null as Schemas["MediaOut"] | null }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ImageUpload label="Обложка" value={value} onChange={setValue} />
      <output data-testid="value">{value?.id ?? "пусто"}</output>
    </>
  );
}

describe("ImageUpload — фото с телефона или компьютера", () => {
  it("загружает выбранный файл и показывает превью", async () => {
    vi.mocked(uploadMedia).mockResolvedValue(media);
    renderWithAdmin(<Harness />);
    const file = new File([new Uint8Array(1000)], "cover.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Обложка"), file);
    expect(uploadMedia).toHaveBeenCalledWith(file);
    expect(await screen.findByTestId("value")).toHaveTextContent("m1");
    expect(screen.getByRole("img", { name: "Обложка" })).toHaveAttribute("src", "/media/images/a/320.webp");
  });

  it("слишком большой файл — понятная ошибка без загрузки", async () => {
    renderWithAdmin(<Harness />);
    const big = new File([new Uint8Array(16 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Обложка"), big);
    expect(screen.getByText("Файл больше 15 МБ — уменьшите фото и попробуйте снова")).toBeInTheDocument();
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("можно убрать картинку", async () => {
    renderWithAdmin(<Harness initial={media} />);
    await userEvent.click(screen.getByRole("button", { name: "Убрать картинку" }));
    expect(screen.getByTestId("value")).toHaveTextContent("пусто");
  });
});
