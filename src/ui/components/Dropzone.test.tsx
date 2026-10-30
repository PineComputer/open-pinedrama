// Dropzone (react-dropzone underneath): one file, dropped or chosen; a drop that brings no file is said so; selected while a file is over it.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dropzone } from "./Dropzone.tsx";

const zone = (onFile = vi.fn(), onNoFile = vi.fn()) => {
  render(<Dropzone title="Drop your screenplay" hint="or click to choose" choose="Choose a screenplay" onFile={onFile} onNoFile={onNoFile} />);
  return { onFile, onNoFile, button: screen.getByRole("button", { name: /^Drop your screenplay/ }) };
};

describe("Dropzone", () => {
  it("hands over a chosen file", async () => {
    const user = userEvent.setup();
    const { onFile } = zone();
    const file = new File(["x"], "a.fountain");
    await user.upload(screen.getByLabelText("Choose a screenplay"), file);
    expect(onFile).toHaveBeenCalledExactlyOnceWith(file);
  });

  it("hands over a dropped file, selected while it is over", async () => {
    const { onFile, button } = zone();
    const file = new File(["x"], "a.fountain");
    const dataTransfer = { files: [file], items: [{ kind: "file", type: "", getAsFile: () => file }], types: ["Files"] };
    fireEvent.dragEnter(button, { dataTransfer });
    await waitFor(() => expect(button).toHaveClass("over"));
    fireEvent.drop(button, { dataTransfer });
    await waitFor(() => expect(onFile).toHaveBeenCalledExactlyOnceWith(file));
    expect(button).not.toHaveClass("over");
  });

  it("says so when a drop brings no file", async () => {
    const { onFile, onNoFile, button } = zone();
    fireEvent.drop(button, { dataTransfer: { files: [], items: [], types: ["text/plain"] } });
    await waitFor(() => expect(onNoFile).toHaveBeenCalledOnce());
    expect(onFile).not.toHaveBeenCalled();
  });
});
