"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  FileJson,
  FileText,
  BookOpen,
  ArrowLeft,
} from "lucide-react";

export interface CodeJournal {
  Code: string;
  Intitule_journal: string;
  Type: string;
  Compte_tresorerie: string;
}

export interface MetaData {
  Entite: string;
  DateExtraction: string;
  NombreJournaux: number;
}

function CodesJournauxApp() {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [codesJournaux, setCodesJournaux] = useState<CodeJournal[]>([]);
  const [metaData, setMetaData] = useState<MetaData | null>(null);
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
    setCodesJournaux([]);
    setMetaData(null);
  };

  const parseCodesJournaux = (workbook: XLSX.WorkBook) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const parsedJournaux: CodeJournal[] = [];
    let entite = "";
    let dateExtraction = "";

    // Extraction des métadonnées
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!row) continue;

      // Recherche de l'entité (première cellule non vide qui n'est pas une métadonnée)
      if (!entite && row[0]) {
        const firstCell = String(row[0]).trim();
        if (
          firstCell &&
          !firstCell.includes("©") &&
          !firstCell.includes("Code") &&
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

    // Si pas d'entité trouvée, utiliser une valeur par défaut
    if (!entite) entite = "ENVOL";
    if (!dateExtraction) {
      const now = new Date();
      dateExtraction = now.toLocaleDateString("fr-FR");
    }

    // Recherche de la ligne d'en-tête (contient "Code" et "Intitulé")
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (row && row[0] === "Code") {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error("Impossible de trouver la ligne d'en-tête avec 'Code'");
    }

    // Extraction des codes journaux
    // Les données commencent généralement 3-4 lignes après l'en-tête
    for (let i = headerRowIndex + 3; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[0]) continue;

      const code = String(row[0]).trim();

      // Ignorer les lignes de légende et les lignes vides
      if (
        code.includes("=") || // Lignes de légende
        code.includes("C.L") ||
        code.includes("Som") ||
        code.includes("Rap") ||
        code.length > 10 || // Codes trop longs
        code === ""
      ) {
        continue;
      }

      // Extraction des données selon la structure observée
      const journal: CodeJournal = {
        Code: code,
        Intitule_journal: String(row[1] || "").trim(),
        Type: String(row[6] || row[7] || "").trim(),
        Compte_tresorerie: String(row[8] || row[9] || "").trim(),
      };

      // Ajouter seulement si on a au moins le code et l'intitulé
      if (journal.Code && journal.Intitule_journal) {
        parsedJournaux.push(journal);
      }
    }

    const meta: MetaData = {
      Entite: entite,
      DateExtraction: dateExtraction,
      NombreJournaux: parsedJournaux.length,
    };

    return { codesJournaux: parsedJournaux, metaData: meta };
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

      const result = parseCodesJournaux(workbook);

      if (result.codesJournaux.length === 0) {
        setError("Aucun code journal détecté. Vérifiez le format du fichier.");
        return;
      }

      setCodesJournaux(result.codesJournaux);
      setMetaData(result.metaData);
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
      codes_journaux: codesJournaux,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codes_journaux_${metaData?.Entite || "export"}_${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJSONSimple = () => {
    // Version simplifiée sans métadonnées
    const json = JSON.stringify(codesJournaux, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codes_journaux_simple_${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    const ws = XLSX.utils.json_to_sheet(codesJournaux);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Codes Journaux");
    XLSX.writeFile(
      wb,
      `codes_journaux_${metaData?.Entite || "export"}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );
  };

  const downloadExcelComplet = () => {
    // Version avec métadonnées dans une feuille séparée
    const wb = XLSX.utils.book_new();

    // Feuille des codes journaux
    const wsJournaux = XLSX.utils.json_to_sheet(codesJournaux);
    XLSX.utils.book_append_sheet(wb, wsJournaux, "Codes Journaux");

    // Feuille des métadonnées
    if (metaData) {
      const metaArray = [
        ["Propriété", "Valeur"],
        ["Entité", metaData.Entite],
        ["Date d'extraction", metaData.DateExtraction],
        ["Nombre de journaux", metaData.NombreJournaux],
      ];
      const wsMeta = XLSX.utils.aoa_to_sheet(metaArray);
      XLSX.utils.book_append_sheet(wb, wsMeta, "Informations");
    }

    XLSX.writeFile(
      wb,
      `codes_journaux_complet_${metaData?.Entite || "export"}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );
  };

  const downloadCSV = () => {
    // Conversion en CSV pour compatibilité maximale
    const ws = XLSX.utils.json_to_sheet(codesJournaux);
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";", RS: "\n" });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codes_journaux_${metaData?.Entite || "export"}_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Fonction pour obtenir la couleur selon le type
  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "trésorerie":
        return "text-blue-600 bg-blue-50";
      case "achats":
        return "text-green-600 bg-green-50";
      case "ventes":
        return "text-purple-600 bg-purple-50";
      case "général":
        return "text-gray-600 bg-gray-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Bouton retour */}
        <div className="mb-4">
          <button
            onClick={handleRetour}
            className="flex items-center gap-2 text-blue-700 hover:text-blue-900 font-medium px-3 py-2 rounded transition-colors bg-blue-50 hover:bg-blue-100"
            type="button"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Codes Journaux - Parser Excel
            </h1>
          </div>

          <div className="space-y-6">
            {/* Upload Section */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fichier Excel - Codes Journaux
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
                  className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors"
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
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
            {codesJournaux.length > 0 && metaData && (
              <div className="space-y-4">
                {/* Success Message */}
                <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      Extraction réussie !
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {metaData.NombreJournaux} codes journaux extraits
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Entité: {metaData.Entite} | Date:{" "}
                      {metaData.DateExtraction}
                    </p>
                  </div>
                </div>

                {/* Download Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <button
                    onClick={downloadJSON}
                    className="bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    JSON complet
                  </button>

                  <button
                    onClick={downloadJSONSimple}
                    className="bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    JSON simple
                  </button>

                  <button
                    onClick={downloadExcel}
                    className="bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    Excel standard
                  </button>

                  <button
                    onClick={downloadExcelComplet}
                    className="bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Excel complet
                  </button>

                  <button
                    onClick={downloadCSV}
                    className="bg-orange-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    CSV (;)
                  </button>
                </div>

                {/* Data Preview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-700 mb-3">
                    Aperçu des codes journaux :
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-3 font-medium text-gray-700">
                            Code
                          </th>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">
                            Intitulé
                          </th>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">
                            Type
                          </th>
                          <th className="text-left py-2 px-3 font-medium text-gray-700">
                            Compte Trésorerie
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {codesJournaux.map((journal, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-gray-100 hover:bg-white transition-colors"
                          >
                            <td className="py-2 px-3 font-mono text-blue-600">
                              {journal.Code}
                            </td>
                            <td className="py-2 px-3">
                              {journal.Intitule_journal}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTypeColor(
                                  journal.Type
                                )}`}
                              >
                                {journal.Type}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-gray-600">
                              {journal.Compte_tresorerie || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(
                    codesJournaux.reduce((acc, j) => {
                      const type = j.Type || "Autre";
                      acc[type] = (acc[type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([type, count]) => (
                    <div
                      key={type}
                      className="bg-white border border-gray-200 rounded-lg p-3 text-center"
                    >
                      <p className="text-2xl font-bold text-gray-800">
                        {count}
                      </p>
                      <p className="text-sm text-gray-600">{type}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Structure attendue du fichier
          </h2>
          <div className="space-y-2 text-sm text-gray-600">
            <p>
              <strong>✓ Format :</strong> Fichier Excel exporté depuis Sage
              Comptabilité
            </p>
            <p>
              <strong>✓ En-tête :</strong> Ligne contenant "Code", "Intitulé",
              "Type", "N° compte trésorerie"
            </p>
            <p>
              <strong>✓ Données :</strong> Chaque ligne représente un code
              journal avec ses propriétés
            </p>
            <p>
              <strong>✓ Colonnes extraites :</strong>
            </p>
            <ul className="ml-6 mt-1 space-y-1">
              <li>
                • <span className="font-mono text-blue-600">Code</span> - Code
                du journal (ACH, BQUE, etc.)
              </li>
              <li>
                •{" "}
                <span className="font-mono text-blue-600">
                  Intitule_journal
                </span>{" "}
                - Libellé complet du journal
              </li>
              <li>
                • <span className="font-mono text-blue-600">Type</span> - Type
                de journal (Achats, Ventes, Trésorerie, Général, etc.)
              </li>
              <li>
                •{" "}
                <span className="font-mono text-blue-600">
                  Compte_tresorerie
                </span>{" "}
                - Numéro de compte associé (optionnel pour les journaux de
                trésorerie)
              </li>
            </ul>
            <p className="mt-3">
              <strong>✓ Formats de sortie disponibles :</strong>
            </p>
            <ul className="ml-6 mt-1 space-y-1">
              <li>
                <span className="text-blue-600">• JSON complet</span> - Inclut
                toutes les propriétés avec métadonnées
              </li>
              <li>
                <span className="text-indigo-600">• JSON simple</span> -
                Uniquement la liste des codes journaux au format épuré
              </li>
              <li>
                <span className="text-green-600">• Excel standard</span> -
                Feuille unique avec la table des codes journaux
              </li>
              <li>
                <span className="text-purple-600">• Excel complet</span> - Deux
                feuilles : codes journaux et informations de l'extraction
              </li>
              <li>
                <span className="text-orange-600">• CSV</span> - Tableau à plat
                avec séparateur point-virgule (compatible Excel et autres
                outils)
              </li>
            </ul>
            <div className="mt-4">
              <p className="text-gray-800 font-medium mb-2">
                Exemple d'entrée brute attendue :
              </p>
              <div className="bg-gray-100 rounded p-3 text-xs font-mono overflow-x-auto">
                {`Code;Intitulé;Type;N° compte trésorerie
ACH;Achats;Achats;
BQ01;Banque Société Générale;Trésorerie;512000
VTES;Ventes France;Ventes;
OD;Opérations diverses;Général;
`}
              </div>
            </div>
            <div className="mt-2">
              <p className="text-gray-800 font-medium mb-2">
                Exemple de transformation obtenue :
              </p>
              <div className="bg-gray-100 rounded p-3 text-xs font-mono overflow-x-auto">
                {`[
  {
    "Code": "ACH",
    "Intitule_journal": "Achats",
    "Type": "Achats",
    "Compte_tresorerie": ""
  },
  {
    "Code": "BQ01",
    "Intitule_journal": "Banque Société Générale",
    "Type": "Trésorerie",
    "Compte_tresorerie": "512000"
  }
  // ...
]`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CodesJournauxApp;
