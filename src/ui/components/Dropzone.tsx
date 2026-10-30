// A place to drop one file, or click to choose it (the spec's Dropzone): dashed, and selected while a file is
// over it. Dragging, dropping, choosing and the keyboard are react-dropzone's (useDropzone), the standard React
// dropzone; this file only draws it.
import { useDropzone } from "react-dropzone";
import { Icon } from "../icons.tsx";

export function Dropzone({ title, hint, choose, accept, onFile, onNoFile }: {
  title: string;
  hint: string;
  /** The file input's name, for a screen reader and for tests. */
  choose: string;
  /** The types react-dropzone accepts, by MIME type and extensions; any file when left out. */
  accept?: Record<string, string[]>;
  onFile: (file: File) => void;
  /** A drop that brought no file: a drag from an editor's file tree carries only the file's path. */
  onNoFile?: () => void;
}) {
  // The root is only where a file may land; choosing is a real button calling react-dropzone's open(), as its
  // docs show for a dialog opened from a button (noClick, noKeyboard), so no control sits inside another.
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple: false,
    accept,
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => files[0] && onFile(files[0]),
  });
  return (
    <div
      {...getRootProps({
        className: ["ds-dropzone", isDragActive && "is-over"].filter(Boolean).join(" "),
        // react-dropzone passes over a drop with no files in it; a handler given to getRootProps still sees it.
        onDrop: (event) => {
          if (event.dataTransfer.files.length === 0) onNoFile?.();
        },
      })}
    >
      <input {...getInputProps({ "aria-label": choose })} />
      <button type="button" onClick={open}>
        <span className="plus">
          <Icon name="upload" />
        </span>
        <b>{title}</b>
        <small>{hint}</small>
      </button>
    </div>
  );
}
