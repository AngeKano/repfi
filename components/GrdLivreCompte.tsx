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
} from "lucide-react";

export interface Transaction {
  Date_GL: string;
  Entite: string;
  Compte: string;
  Date: string;
  Code_Journal: string;
  Numero_Piece: string;
  Libelle_Ecriture: string;
  Debit: number;
  Credit: number;
  Solde: number;
}

export interface CompteData {
  Numero_Compte: string;
  Libelle_Compte: string;
  Periode: string;
  Transactions: Transaction[];
}

function parseAmount(value: any): number {
  if (!value) return 0;
  const strValue = String(value).trim();
  if (!strValue || strValue === "-" || strValue === "") return 0;
  const cleaned = strValue
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const cleaned = String(dateStr).replace(/\D/g, "");
  if (cleaned.length === 6) {
    const day = cleaned.substring(0, 2);
    const month = cleaned.substring(2, 4);
    const year = cleaned.substring(4, 6);
    const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    return `${day}/${month}/${fullYear}`;
  }
  return dateStr;
}

const GrandLivreComptesApp: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [comptesData, setComptesData] = useState<CompteData[]>([]);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState("");

  const handleRetour = () => {
    // Si vous souhaitez revenir à une page précédente dans Next.js :
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        // Si pas d'historique, redirigez vers la racine
        window.location.href = "/";
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setError("");
    setComptesData([]);
    setAllTransactions([]);
  };

  const parseGrandLivreComptes = (workbook: XLSX.WorkBook) => {
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const parsedComptes: CompteData[] = [];
    const parsedTransactions: Transaction[] = [];

    let entite = "";
    let dateGL = "";
    let periode = "";

    // Extraction des métadonnées depuis l'en-tête
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!entite && row[0]) {
        const firstCell = String(row[0]).trim();
        if (
          firstCell &&
          !firstCell.includes("Date") &&
          !firstCell.includes("Impression") &&
          !firstCell.includes("©")
        ) {
          entite = firstCell;
        }
      }
      if (row.some((cell) => String(cell).includes("Période du"))) {
        const idx = row.findIndex((cell) =>
          String(cell).includes("Période du")
        );
        if (data[i][idx + 1]) {
          const dateFin = String(data[i + 1]?.[idx + 1] || "").trim();
          const match = dateFin.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
          if (match) {
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            periode = `${year}${match[2]}`;
            dateGL = dateFin;
          }
        }
      }
    }

    if (!entite) entite = "ENVOL";
    if (!periode) periode = "202412";
    if (!dateGL) dateGL = "31/12/2024";

    // Parse les comptes et transactions
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] || "").trim();
      const col1 = row[1];
      const col2 = String(row[2] || "").trim();

      // Détection d'un compte : col0 = numéro (6 chiffres), col1 = null, col2 = libellé
      if (
        col0 &&
        /^\d{6}$/.test(col0) &&
        col1 === null &&
        col2 &&
        !col2.includes("Total")
      ) {
        const compte: CompteData = {
          Numero_Compte: col0,
          Libelle_Compte: col2,
          Periode: periode,
          Transactions: [],
        };

        // Chercher toutes les transactions de ce compte
        for (let j = i + 1; j < data.length; j++) {
          const transRow = data[j];
          const transCol0 = String(transRow[0] || "").trim();
          const transCol2 = String(transRow[2] || "").trim();

          // Stop si on trouve "Total compte"
          if (transCol2.includes("Total")) break;

          // Stop si on trouve un nouveau compte
          if (transCol0 && /^\d{6}$/.test(transCol0) && transRow[1] === null)
            break;

          // Si c'est une date (DDMMYY) et qu'il y a un code journal, c'est une transaction
          if (/^\d{6}$/.test(transCol0) && transRow[1] !== null) {
            const date = formatDate(transCol0);
            const codeJournal = String(transRow[1] || "").trim();
            const numeroPiece = String(transRow[2] || "").trim();
            const libelle = String(transRow[5] || "").trim();

            // Les montants sont aux colonnes 11 (débit), 14 (crédit), 17 (solde)
            const debit = parseAmount(transRow[11]);
            const credit = parseAmount(transRow[14]);
            const solde = parseAmount(transRow[17]);

            const transaction: Transaction = {
              Date_GL: dateGL,
              Entite: entite,
              Compte: compte.Numero_Compte,
              Date: date,
              Code_Journal: codeJournal,
              Numero_Piece: numeroPiece,
              Libelle_Ecriture: libelle,
              Debit: debit,
              Credit: credit,
              Solde: solde,
            };

            compte.Transactions.push(transaction);
            parsedTransactions.push(transaction);
          }
        }

        if (compte.Transactions.length > 0) {
          parsedComptes.push(compte);
        }
      }
    }

    return { comptesData: parsedComptes, allTransactions: parsedTransactions };
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

      const result = parseGrandLivreComptes(workbook);

      if (result.comptesData.length === 0) {
        setError("Aucun compte détecté. Vérifiez le format du fichier.");
        return;
      }

      setComptesData(result.comptesData);
      setAllTransactions(result.allTransactions);
    } catch (err) {
      setError(
        `Erreur: ${err instanceof Error ? err.message : "Erreur inconnue"}`
      );
    } finally {
      setProcessing(false);
    }
  };

  const downloadJSON = () => {
    const json = JSON.stringify(comptesData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grand_livre_comptes_${
      new Date().toISOString().split("T")[0]
    }.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadExcelComplete = () => {
    const flatData: any[] = [];
    comptesData.forEach((compte) => {
      compte.Transactions.forEach((trans) => {
        flatData.push({
          Numero_Compte: compte.Numero_Compte,
          Libelle_Compte: compte.Libelle_Compte,
          Periode: compte.Periode,
          ...trans,
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Grand Livre Comptes");
    XLSX.writeFile(
      wb,
      `grand_livre_comptes_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Bouton retour */}
        <div className="mb-4">
          <button
            onClick={handleRetour}
            className="flex items-center gap-2 text-emerald-700 hover:text-emerald-900 font-medium px-3 py-2 rounded transition-colors bg-emerald-50 hover:bg-emerald-100"
            type="button"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
            <h1 className="text-3xl font-bold text-gray-800">
              Grand Livre des Comptes - Parser
            </h1>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fichier Excel - Grand Livre des Comptes
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
                  className="flex items-center justify-center w-full px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors"
                >
                  <div className="text-center">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {file
                        ? file.name
                        : "Cliquez pour uploader un fichier Excel"}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={handleProcess}
              disabled={!file || processing}
              className="w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Traitement en cours...
                </>
              ) : (
                <>Analyser le fichier</>
              )}
            </button>

            {error && (
              <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {comptesData.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      Traitement réussi !
                    </p>
                    <p className="text-sm text-green-600 mt-1">
                      {comptesData.length} comptes • {allTransactions.length}{" "}
                      transactions
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <button
                    onClick={downloadJSON}
                    className="bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    JSON structuré
                  </button>

                  <button
                    onClick={downloadExcelComplete}
                    className="bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Excel complet
                  </button>
                </div>
                {/* Example Output */}
                <div className="mt-4 bg-indigo-50 rounded-xl shadow-lg p-6">
                  <h2 className="text-lg font-semibold text-gray-800 mb-3">
                    Exemple de sortie JSON
                  </h2>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs overflow-x-auto">
                    {`[
                        {
                          "Numero_Compte": "101300",
                          "Libelle_Compte": "Capital scrit, app., vers non amort",
                          "Periode": "202412",
                          "Transactions": [
                            {
                              "Date_GL": "31/12/2024",
                              "Entite": "ENVOL",
                              "Compte": "101300",
                              "Date": "01/01/2024",
                              "Code_Journal": "RAN",
                              "Numero_Piece": "915",
                              "Libelle_Ecriture": "RAN 2023",
                              "Debit": 0,
                              "Credit": 1050000,
                              "Solde": -1050000
                            }
                          ]
                        },
                        {
                          "Numero_Compte": "111000",
                          "Libelle_Compte": "Réserve Légale",
                          "Periode": "202412",
                          "Transactions": [
                            {
                              "Date_GL": "31/12/2024",
                              "Entite": "ENVOL",
                              "Compte": "111000",
                              "Date": "01/01/2024",
                              "Code_Journal": "RAN",
                              "Numero_Piece": "915",
                              "Libelle_Ecriture": "RAN 2023",
                              "Debit": 0,
                              "Credit": 210000,
                              "Solde": -210000
                            }
                          ]
                        },
                    ]`}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrandLivreComptesApp;
