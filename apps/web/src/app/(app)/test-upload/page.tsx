import { ResumeUpload } from "@/components/profile/ResumeUpload";

export default function TestUploadPage() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-2">Test Resume Upload</h1>
      <p className="text-gray-500 mb-8">
        Upload a PDF or DOCX resume to verify the storage pipeline.
      </p>
      <ResumeUpload />
    </div>
  );
}
