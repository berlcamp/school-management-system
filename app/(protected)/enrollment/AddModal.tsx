"use client";

import { Enrollment } from "@/types";
import EnrollmentWizard from "./components/EnrollmentWizard";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editData?: Enrollment | null;
}

export const AddModal = ({ isOpen, onClose, editData }: ModalProps) => {
  return (
    <EnrollmentWizard isOpen={isOpen} onClose={onClose} editData={editData} />
  );
};
