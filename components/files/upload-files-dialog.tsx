// components/files/upload-files-dialog.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, X, FileSpreadsheet, AlertCircle } from "lucide-react";
import { FileType } from "@prisma/client";

interface UploadFile {
  file: File;
  id: string;
  fileType?: FileType;
  error?: string;
}

interface UploadFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onSuccess?: () => void;
}

export default function UploadFilesDialog({
  open,
  onOpenChange,
  clientId,
  onSuccess,
}: UploadFilesDialogProps) {
  const router = useRouter();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  const MAX_FILES = 10;

  const isValidExcel = (file: File) => {
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xlsx",
      ".xls",
    ];
    return validTypes.some(
      (type) => file.type === type || file.name.endsWith(type)
    );
  };

  const detectFileType = (fileName: string): FileType | undefined => {
    // Normaliser le nom du fichier (minuscules, retirer les chiffres et caractères spéciaux)
    const normalizedName = fileName
      .toLowerCase()
      .replace(/[0-9_\-\.]/g, " ")
      .trim();

    // Définir les mots-clés pour chaque type de fichier
    const keywords = {
      GRAND_LIVRE_COMPTES: [
        "grand",
        "livre",
        "livres",
        "compte",
        "comptes",
        "gl",
        "glcompte",
        "glcomptes",
        "grandlivre",
        "grandlivrecompte",
        "grandlivrecomptes",
      ],
      GRAND_LIVRE_TIERS: [
        "grand",
        "livre",
        "livres",
        "tiers",
        "tier",
        "gl",
        "gltiers",
        "gltier",
        "grandlivretiers",
        "grandlivretier",
      ],
      PLAN_COMPTES: [
        "plan",
        "compte",
        "comptes",
        "cmpt",
        "pl",
        "plcompte",
        "plcomptes",
        "plancompte",
        "plancomptes",
      ],
      PLAN_TIERS: [
        "plan",
        "tiers",
        "tier",
        "trs",
        "pl",
        "pltiers",
        "pltier",
        "plantiers",
        "plantier",
      ],
      CODE_JOURNAL: [
        "code",
        "journal",
        "journaux",
        "journeau",
        "cd",
        "cj",
        "codejournal",
        "codejournaux",
        "cdjournal",
      ],
    };

    // Fonction pour vérifier si le nom contient les mots-clés d'un type
    const matchesType = (type: FileType, words: string[]): number => {
      let score = 0;
      words.forEach((word) => {
        if (normalizedName.includes(word)) {
          score += word.length; // Score basé sur la longueur du mot pour privilégier les matches plus spécifiques
        }
      });
      return score;
    };

    // Calculer le score pour chaque type
    const scores: { type: FileType; score: number }[] = [
      {
        type: "GRAND_LIVRE_COMPTES" as FileType,
        score: matchesType(
          "GRAND_LIVRE_COMPTES" as FileType,
          keywords.GRAND_LIVRE_COMPTES
        ),
      },
      {
        type: "GRAND_LIVRE_TIERS" as FileType,
        score: matchesType(
          "GRAND_LIVRE_TIERS" as FileType,
          keywords.GRAND_LIVRE_TIERS
        ),
      },
      {
        type: "PLAN_COMPTES" as FileType,
        score: matchesType("PLAN_COMPTES" as FileType, keywords.PLAN_COMPTES),
      },
      {
        type: "PLAN_TIERS" as FileType,
        score: matchesType("PLAN_TIERS" as FileType, keywords.PLAN_TIERS),
      },
      {
        type: "CODE_JOURNAL" as FileType,
        score: matchesType("CODE_JOURNAL" as FileType, keywords.CODE_JOURNAL),
      },
    ];

    // Trouver le type avec le meilleur score
    const bestMatch = scores.reduce((prev, current) =>
      current.score > prev.score ? current : prev
    );

    // Retourner le type seulement si le score est supérieur à 0
    return bestMatch.score > 0 ? bestMatch.type : undefined;
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles);
    const validFiles: UploadFile[] = [];

    fileArray.forEach((file) => {
      if (files.length + validFiles.length >= MAX_FILES) {
        return;
      }

      if (!isValidExcel(file)) {
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        validFiles.push({
          file,
          id: Math.random().toString(36),
          error: "Fichier trop volumineux (max 2MB)",
        });
        return;
      }

      // Détecter automatiquement le type de fichier
      const detectedType = detectFileType(file.name);

      validFiles.push({
        file,
        id: Math.random().toString(36),
        fileType: detectedType, // Assigner automatiquement le type détecté
      });
    });

    setFiles((prev) => [...prev, ...validFiles].slice(0, MAX_FILES));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFileType = (id: string, fileType: FileType) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, fileType } : f)));
  };

  const handleSubmit = async () => {
    setError("");

    if (!selectedDate) {
      setError("Veuillez sélectionner une date");
      return;
    }

    const invalidFiles = files.filter((f) => !f.fileType || f.error);
    if (invalidFiles.length > 0) {
      setError("Tous les fichiers doivent avoir un type valide");
      return;
    }

    setLoading(true);

    const date = new Date(selectedDate);
    const fileYear = date.getFullYear();
    const fileMonth = date.getMonth() + 1;
    const fileDay = date.getDate();

    try {
      for (const uploadFile of files) {
        const formData = new FormData();
        formData.append("file", uploadFile.file);
        formData.append("clientId", clientId);
        formData.append("fileType", uploadFile.fileType!);
        formData.append("fileYear", fileYear.toString());
        formData.append("fileMonth", fileMonth.toString());
        formData.append("fileDay", fileDay.toString());

        const response = await fetch("/api/files", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          console.error(`Erreur upload ${uploadFile.file.name}`);
        }
      }

      onOpenChange(false);
      setFiles([]);
      setSelectedDate("");
      router.refresh();
      onSuccess?.();
    } catch (err) {
      setError("Erreur lors de l'upload");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto min-w-5xl">
        <DialogHeader>
          <DialogTitle>Uploader des fichiers</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Date Selection */}
          <div>
            <Label htmlFor="date">Date des fichiers *</Label>
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-2"
            />
          </div>

          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed flex-col justify-center items-center rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">
              Glissez-déposez vos fichiers Excel ici
            </p>
            <p className="text-sm text-gray-500 mb-4">
              ou cliquez pour sélectionner (max 10 fichiers, 2MB chacun)
            </p>
            <Input
              type="file"
              multiple
              accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
              id="file-input"
            />
            <div className="flex justify-center">
              <Label htmlFor="file-input">
                <Button variant="outline" type="button" asChild>
                  <span>Sélectionner des fichiers</span>
                </Button>
              </Label>
            </div>
          </div>

          {/* Files List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <Label>Fichiers sélectionnés ({files.length}/10)</Label>
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-white"
                >
                  <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {(uploadFile.file.size / 1024).toFixed(2)} KB
                    </p>
                    {uploadFile.error && (
                      <p className="text-sm text-red-500">{uploadFile.error}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 w-48">
                    <Select
                      disabled={!!uploadFile.error}
                      value={uploadFile.fileType}
                      onValueChange={(value) =>
                        updateFileType(uploadFile.id, value as FileType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Type de fichier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GRAND_LIVRE_COMPTES">
                          Grand Livre Comptes
                        </SelectItem>
                        <SelectItem value="GRAND_LIVRE_TIERS">
                          Grand Livre Tiers
                        </SelectItem>
                        <SelectItem value="PLAN_COMPTES">
                          Plan Comptes
                        </SelectItem>
                        <SelectItem value="PLAN_TIERS">Plan Tiers</SelectItem>
                        <SelectItem value="CODE_JOURNAL">
                          Code Journal
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadFile.id)}
                    className="flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setFiles([]);
            }}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              files.length === 0 ||
              !selectedDate ||
              files.filter((f) => !f.fileType || f.error).length > 0
            }
          >
            {loading
              ? "Upload en cours..."
              : `Uploader ${files.length} fichier(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
