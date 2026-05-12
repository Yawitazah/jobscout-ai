"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface ResumeUploadProps {
  onSuccess?: (id: string, filename: string, mimeType: string) => void;
}

export function ResumeUpload({ onSuccess }: ResumeUploadProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setStatus("uploading");
      setMessage("");

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload/resume", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          setMessage(data.error ?? "Upload failed");
          return;
        }

        setStatus("success");
        setMessage(`${file.name} uploaded successfully`);
        onSuccess?.(data.id, file.name, file.type);
      } catch {
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    },
    [onSuccess]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive
            ? "border-blue-500 bg-blue-50"
            : status === "success"
              ? "border-green-400 bg-green-50"
              : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          {status === "success" ? (
            <CheckCircle className="w-10 h-10 text-green-500" />
          ) : status === "error" ? (
            <AlertCircle className="w-10 h-10 text-red-500" />
          ) : status === "uploading" ? (
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="w-10 h-10 text-gray-400" />
          )}

          <div>
            {status === "uploading" ? (
              <p className="text-gray-600">Uploading…</p>
            ) : isDragActive ? (
              <p className="text-blue-600 font-medium">Drop your resume here</p>
            ) : (
              <>
                <p className="font-medium text-gray-700">
                  Drag & drop your resume, or{" "}
                  <span className="text-blue-600">browse</span>
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  PDF or DOCX · max 10 MB
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${
            status === "error"
              ? "bg-red-50 text-red-700"
              : "bg-green-50 text-green-700"
          }`}
        >
          {status === "error" ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <FileText className="w-4 h-4 flex-shrink-0" />
          )}
          {message}
        </div>
      )}
    </div>
  );
}
