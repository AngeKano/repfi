"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  FileJson,
  FileText,
  Calculator,
  ArrowLeft,
} from "lucide-react";

export interface Compte {
  Compte: string;
  Type: string;
  Intitule_compte: string;
  Nature_compte: string;
}

export interface MetaData {
  Entite: string;
  DateExtraction: string;
  NombreComptes: number;
  NombreComptesDetail: number;
  NombreComptesTotal: number;
}

export interface Statistics {
  parNature: Record<string, number>;
  parClasse: Record<string, number>;
  parType: Record<string, number>;
}

function PlanComptableApp() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [metaData, setMetaData] = useState<MetaData | null>(null);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [error, setError] = useState("");

  const handleRetour = () => {
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "/";
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setError("");
    setComptes([]);
    setMetaData(null);
    setStatistics(null);
  };

  const getClasseCompte = (numeroCompte: string): string => {
    if (!numeroCompte) return "Autre";
    const firstDigit = numeroCompte.charAt(0);
    switch (firstDigit) {
      case "1":
        return "Classe 1 - Capitaux";
      case "2":
        return "Classe 2 - Immobilisations";
      case "3":
        return "Classe 3 - Stocks";
      case "4":
        return "Classe 4 - Tiers";
      case "5":
        return "Classe 5 - Trésorerie";
      case "6":
        return "Classe 6 - Charges";
      case "7":
        return "Classe 7 - Produits";
      case "8":
        return "Classe 8 - Comptes spéciaux";
      case "9":
        return "Classe 9 - Analytique";
      default:
        return "Autre";
    }
  };

  const parsePlanComptable = (workbook: XLSX.WorkBook) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const parsedComptes: Compte[] = [];
    let entite = "";
    let dateExtraction = "";
    let comptesDetail = 0;
    let comptesTotal = 0;

    // Extraction des métadonnées
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!row) continue;

      // Recherche de l'entité
      if (!entite && row[0]) {
        const firstCell = String(row[0]).trim();
        if (
          firstCell &&
          !firstCell.includes("©") &&
          !firstCell.includes("Type") &&
          firstCell.length < 50
        ) {
          entite = firstCell;
        }
      }

      // Recherche de la date d'extraction
      for (let j = 0; j < row.length; j++) {
        if (String(row[j] || "").includes("Date de tirage")) {
          // La date est généralement 2 colonnes après
          if (data[i][j + 2]) {
            dateExtraction = String(data[i][j + 2]).trim();
          }
          break;
        }
      }
    }

    // Valeurs par défaut
    if (!entite) entite = "ENVOL";
    if (!dateExtraction) {
      const now = new Date();
      dateExtraction = now.toLocaleDateString("fr-FR");
    }

    // Recherche de la ligne d'en-tête
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (row && row[0] === "Type" && String(row[1] || "").includes("compte")) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error(
        "Impossible de trouver la ligne d'en-tête du plan comptable"
      );
    }

    // Extraction des comptes
    // Les données commencent généralement 3 lignes après l'en-tête
    for (let i = headerRowIndex + 3; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue;

      const numeroCompte = String(row[1]).trim();
      const typeCompte = String(row[0] || "").trim();

      // Ignorer les lignes vides ou invalides
      if (!numeroCompte || numeroCompte.length < 3) continue;

      // Compter les types
      if (typeCompte === "Détail") comptesDetail++;
      if (typeCompte === "Total") comptesTotal++;

      const compte: Compte = {
        Compte: numeroCompte,
        Type: typeCompte || "Détail",
        Intitule_compte: String(row[4] || "").trim(),
        Nature_compte: String(row[14] || "").trim() || "Aucune",
      };

      parsedComptes.push(compte);
    }

    // Calculer les statistiques
    const stats: Statistics = {
      parNature: {},
      parClasse: {},
      parType: {},
    };

    parsedComptes.forEach((compte) => {
      // Par nature
      stats.parNature[compte.Nature_compte] =
        (stats.parNature[compte.Nature_compte] || 0) + 1;

      // Par classe
      const classe = getClasseCompte(compte.Compte);
      stats.parClasse[classe] = (stats.parClasse[classe] || 0) + 1;

      // Par type
      stats.parType[compte.Type] = (stats.parType[compte.Type] || 0) + 1;
    });

    const meta: MetaData = {
      Entite: entite,
      DateExtraction: dateExtraction,
      NombreComptes: parsedComptes.length,
      NombreComptesDetail: comptesDetail,
      NombreComptesTotal: comptesTotal,
    };

    return { comptes: parsedComptes, metaData: meta, statistics: stats };
  };

  const handleProcess = async () => {
    if (!file) {
      setError("Veuillez uploader un fichier");
      return;
    }

    setProcessing(true);
    setError("");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        cellStyles: true,
        cellDates: true,
        cellNF: true,
        sheetStubs: true,
      });

      const result = parsePlanComptable(workbook);

      if (result.comptes.length === 0) {
        setError("Aucun compte détecté. Vérifiez le format du fichier.");
        return;
      }

      setComptes(result.comptes);
      setMetaData(result.metaData);
      setStatistics(result.statistics);
    } catch (err) {
      setError(
        `Erreur lors du traitement: ${
          err instanceof Error ? err.message : "Erreur inconnue"
        }`
      );
    } finally {
      setProcessing(false);
    }
  };

  const downloadJSON = () => {
    const exportData = {
      meta: metaData,
      comptes: comptes,
      statistiques: statistics,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan_comptable_${metaData?.Entite || "export"}_${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(comptes);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plan Comptable");
    XLSX.writeFile(
      wb,
      `plan_comptable_${metaData?.Entite || "export"}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Bouton retour */}
        <div className="mb-4">
          <button
            onClick={handleRetour}
            className="flex items-center gap-2 text-indigo-700 hover:text-indigo-900 font-medium px-3 py-2 rounded transition-colors bg-indigo-50 hover:bg-indigo-100"
            type="button"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <Calculator className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Plan Comptable - Parser Excel
            </h1>
          </div>

          <div className="space-y-6">
            {/* Upload Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fichier Excel - Plan Comptable
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors"
                >
                  <div className="text-center">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {file
                        ? file.name
                        : "Cliquez pour uploader un fichier Excel"}
                    </p>
                    {file && (
                      <p className="text-xs text-gray-500 mt-1">
                        Taille: {(file.size / 1024).toFixed(2)} KB
                      </p>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {/* Process Button */}
            <button
              onClick={handleProcess}
              disabled={!file || processing}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Analyse en cours...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-5 h-5" />
                  Analyser le fichier
                </>
              )}
            </button>

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Success Results */}
            {comptes.length > 0 && metaData && statistics && (
              <div className="space-y-4">
                {/* Success Message */}
                <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      Extraction réussie !
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {metaData.NombreComptes} comptes extraits (
                      {metaData.NombreComptesDetail} détail,{" "}
                      {metaData.NombreComptesTotal} total)
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Entité: {metaData.Entite} | Date:{" "}
                      {metaData.DateExtraction}
                    </p>
                  </div>
                </div>

                {/* Download Buttons */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <button
                    onClick={downloadJSON}
                    className="bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    JSON complet
                  </button>

                  <button
                    onClick={downloadExcel}
                    className="bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    Excel standard
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Example Output */}
        <div className="mt-4 bg-indigo-50 rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Exemple de sortie JSON
          </h2>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
            {`{
                "meta": {
                    "Entite": "ENVOL",
                    "DateExtraction": "13/10/25",
                    "NombreComptes": 143,
                    "NombreComptesDetail": 142,
                    "NombreComptesTotal": 1
                },
                "comptes": [
                    {
                    "Compte": "101200",
                    "Type": "Détail",
                    "Intitule_compte": "Capital Souscrit Appelé non Versé",
                    "Nature_compte": "Capitaux"
                    },
                ],
            }`}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default PlanComptableApp;
