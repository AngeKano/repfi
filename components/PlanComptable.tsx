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
  Calculator,
  ArrowLeft,
  TrendingUp,
  DollarSign,
  Package,
  Users,
  Building,
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
  const [activeTab, setActiveTab] = useState<"preview" | "stats">("preview");

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

  const downloadJSONSimple = () => {
    const json = JSON.stringify(comptes, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan_comptable_simple_${
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

  const downloadExcelParClasse = () => {
    const wb = XLSX.utils.book_new();

    // Créer une feuille par classe
    for (let classe = 1; classe <= 9; classe++) {
      const comptesClasse = comptes.filter((c) =>
        c.Compte.startsWith(classe.toString())
      );
      if (comptesClasse.length > 0) {
        const ws = XLSX.utils.json_to_sheet(comptesClasse);
        XLSX.utils.book_append_sheet(wb, ws, `Classe ${classe}`);
      }
    }

    // Ajouter une feuille de résumé
    if (metaData && statistics) {
      const summary = [
        ["Plan Comptable - Résumé"],
        [],
        ["Entité", metaData.Entite],
        ["Date d'extraction", metaData.DateExtraction],
        ["Nombre total de comptes", metaData.NombreComptes],
        ["Comptes de détail", metaData.NombreComptesDetail],
        ["Comptes de total", metaData.NombreComptesTotal],
        [],
        ["Répartition par classe"],
        ...Object.entries(statistics.parClasse).map(([k, v]) => [k, v]),
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summary);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Résumé");
    }

    XLSX.writeFile(
      wb,
      `plan_comptable_par_classe_${metaData?.Entite || "export"}_${
        new Date().toISOString().split("T")[0]
      }.xlsx`
    );
  };

  const downloadCSV = () => {
    const ws = XLSX.utils.json_to_sheet(comptes);
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";", RS: "\n" });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan_comptable_${metaData?.Entite || "export"}_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getNatureIcon = (nature: string) => {
    switch (nature.toLowerCase()) {
      case "capitaux":
        return <Building className="w-4 h-4" />;
      case "immobilisation":
        return <Package className="w-4 h-4" />;
      case "charge":
      case "charges":
        return <TrendingUp className="w-4 h-4" />;
      case "produit":
      case "produits":
        return <DollarSign className="w-4 h-4" />;
      case "client":
      case "fournisseur":
      case "salarié":
        return <Users className="w-4 h-4" />;
      default:
        return <Calculator className="w-4 h-4" />;
    }
  };

  const getNatureColor = (nature: string) => {
    switch (nature.toLowerCase()) {
      case "capitaux":
        return "text-purple-600 bg-purple-50";
      case "immobilisation":
        return "text-blue-600 bg-blue-50";
      case "charge":
      case "charges":
        return "text-red-600 bg-red-50";
      case "produit":
      case "produits":
        return "text-green-600 bg-green-50";
      case "client":
        return "text-cyan-600 bg-cyan-50";
      case "fournisseur":
        return "text-orange-600 bg-orange-50";
      case "salarié":
        return "text-indigo-600 bg-indigo-50";
      case "banque":
        return "text-teal-600 bg-teal-50";
      case "caisse":
        return "text-amber-600 bg-amber-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
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
                  
                  <button
                    onClick={downloadJSONSimple}
                    className="bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileJson className="w-5 h-5" />
                    JSON simple
                  </button>

                  <button
                    onClick={downloadExcelParClasse}
                    className="bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Excel par classe
                  </button>

                  <button
                    onClick={downloadCSV}
                    className="bg-orange-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-5 h-5" />
                    CSV (;)
                  </button>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setActiveTab("preview")}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === "preview"
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      Aperçu des comptes
                    </button>
                    <button
                      onClick={() => setActiveTab("stats")}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === "stats"
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      Statistiques
                    </button>
                  </nav>
                </div>

                {/* Tab Content */}
                {activeTab === "preview" && (
                  <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-auto">
                    <h3 className="font-medium text-gray-700 mb-3">
                      Aperçu du plan comptable :
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2 px-3 font-medium text-gray-700">
                              Compte
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">
                              Type
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">
                              Intitulé
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">
                              Nature
                            </th>
                            <th className="text-left py-2 px-3 font-medium text-gray-700">
                              Classe
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {comptes.slice(0, 50).map((compte, idx) => (
                            <tr
                              key={idx}
                              className="border-b border-gray-100 hover:bg-white transition-colors"
                            >
                              <td className="py-2 px-3 font-mono text-indigo-600">
                                {compte.Compte}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                    compte.Type === "Total"
                                      ? "bg-gray-200 text-gray-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {compte.Type}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                {compte.Intitule_compte}
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getNatureColor(
                                    compte.Nature_compte
                                  )}`}
                                >
                                  {getNatureIcon(compte.Nature_compte)}
                                  {compte.Nature_compte}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-xs text-gray-600">
                                {getClasseCompte(compte.Compte).split(" - ")[0]}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {comptes.length > 50 && (
                        <p className="text-center text-sm text-gray-500 mt-4">
                          Affichage des 50 premiers comptes sur {comptes.length}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "stats" && (
                  <div className="space-y-6">
                    {/* Statistiques par classe */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-700 mb-3">
                        Répartition par classe comptable
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(statistics.parClasse)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([classe, count]) => (
                            <div
                              key={classe}
                              className="bg-white border border-gray-200 rounded-lg p-3"
                            >
                              <p className="text-2xl font-bold text-indigo-600">
                                {count}
                              </p>
                              <p className="text-sm text-gray-600">{classe}</p>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Statistiques par nature */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-700 mb-3">
                        Répartition par nature de compte
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(statistics.parNature)
                          .sort(([a, b], [c, d]) => d - b)
                          .map(([nature, count]) => (
                            <div
                              key={nature}
                              className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-2"
                            >
                              <div
                                className={`p-2 rounded ${getNatureColor(
                                  nature
                                )}`}
                              >
                                {getNatureIcon(nature)}
                              </div>
                              <div>
                                <p className="text-xl font-bold text-gray-800">
                                  {count}
                                </p>
                                <p className="text-xs text-gray-600">
                                  {nature}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Graphique en barres simple */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-medium text-gray-700 mb-3">
                        Distribution visuelle par classe
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(statistics.parClasse)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([classe, count]) => {
                            const percentage = (count / comptes.length) * 100;
                            return (
                              <div
                                key={classe}
                                className="flex items-center gap-3"
                              >
                                <div className="w-32 text-sm text-gray-600">
                                  {classe.split(" - ")[0]}
                                </div>
                                <div className="flex-1 bg-gray-200 rounded-full h-6">
                                  <div
                                    className="bg-indigo-600 h-6 rounded-full flex items-center justify-end pr-2"
                                    style={{ width: `${percentage}%` }}
                                  >
                                    <span className="text-xs text-white font-medium">
                                      {count}
                                    </span>
                                  </div>
                                </div>
                                <div className="w-12 text-sm text-gray-600 text-right">
                                  {percentage.toFixed(0)}%
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                )}
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
              Comptabilité (Plan Comptable)
            </p>
            <p>
              <strong>✓ En-tête :</strong> Ligne contenant "Type", "N°compte",
              "Intitulé du compte", "Nature de compte"
            </p>
            <p>
              <strong>✓ Colonnes extraites :</strong>
            </p>
            <ul className="ml-6 mt-1 space-y-1">
              <li>
                • <span className="font-mono text-indigo-600">Compte</span> -
                Numéro du compte comptable
              </li>
              <li>
                • <span className="font-mono text-indigo-600">Type</span> -
                Détail ou Total
              </li>
              <li>
                •{" "}
                <span className="font-mono text-indigo-600">
                  Intitule_compte
                </span>{" "}
                - Libellé du compte
              </li>
              <li>
                •{" "}
                <span className="font-mono text-indigo-600">Nature_compte</span>{" "}
                - Nature (Capitaux, Charge, Produit, etc.)
              </li>
            </ul>
            <p className="mt-3">
              <strong>✓ Classes comptables reconnues :</strong>
            </p>
            <ul className="ml-6 mt-1 space-y-1 text-xs">
              <li>• Classe 1 : Comptes de capitaux</li>
              <li>• Classe 2 : Comptes d'immobilisations</li>
              <li>• Classe 3 : Comptes de stocks et en-cours</li>
              <li>• Classe 4 : Comptes de tiers</li>
              <li>• Classe 5 : Comptes de trésorerie</li>
              <li>• Classe 6 : Comptes de charges</li>
              <li>• Classe 7 : Comptes de produits</li>
              <li>• Classe 8 : Comptes spéciaux</li>
            </ul>
            <p className="mt-3">
              <strong>✓ Formats de sortie disponibles :</strong>
            </p>
            <ul className="ml-6 mt-1 space-y-1">
              <li>
                <span className="text-blue-600">• JSON complet</span> - Avec
                métadonnées et statistiques
              </li>
              <li>
                <span className="text-indigo-600">• JSON simple</span> - Liste
                des comptes uniquement
              </li>
              <li>
                <span className="text-green-600">• Excel standard</span> -
                Tableau simple du plan comptable
              </li>
              <li>
                <span className="text-purple-600">• Excel par classe</span> -
                Une feuille par classe + résumé
              </li>
              <li>
                <span className="text-orange-600">• CSV</span> - Format
                universel avec séparateur point-virgule
              </li>
            </ul>
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
                    {
                    "Compte": "401100",
                    "Type": "Détail",
                    "Intitule_compte": "Fournisseurs",
                    "Nature_compte": "Fournisseur"
                    },
                    {
                    "Compte": "411100",
                    "Type": "Détail",
                    "Intitule_compte": "Clients",
                    "Nature_compte": "Client"
                    },
                    {
                    "Compte": "601100",
                    "Type": "Détail",
                    "Intitule_compte": "Achats de marchandises",
                    "Nature_compte": "Charge"
                    },
                    {
                    "Compte": "701100",
                    "Type": "Détail",
                    "Intitule_compte": "Vente de marchandises",
                    "Nature_compte": "Produit"
                    }
                ],
                "statistiques": {
                    "parNature": {
                    "Capitaux": 7,
                    "Immobilisation": 12,
                    "Fournisseur": 2,
                    "Client": 2,
                    "Charge": 45,
                    "Produit": 9,
                    "...": "..."
                    },
                    "parClasse": {
                    "Classe 1 - Capitaux": 7,
                    "Classe 2 - Immobilisations": 12,
                    "Classe 4 - Tiers": 35,
                    "Classe 6 - Charges": 45,
                    "Classe 7 - Produits": 9,
                    "...": "..."
                    }
                }
            }`}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default PlanComptableApp;
