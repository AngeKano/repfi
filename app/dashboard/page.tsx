"use client";
import { useSession } from "next-auth/react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { signOut } from "next-auth/react";
import { Building2, Users, Upload, LogOut, User } from "lucide-react";

type CustomSessionUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  id?: string;
  type?: string;
};

export default function Dashboard() {
  const { data: session } = useSession();
  const [clients, setClients] = useState<any[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const user: CustomSessionUser | undefined = useMemo(
    () =>
      session && session.user
        ? {
            ...session.user,
            id: (session.user as CustomSessionUser).id,
            type: (session.user as CustomSessionUser).type,
          }
        : undefined,
    [session]
  );

  useEffect(() => {
    if (user?.type === "partner") {
      fetch("/api/clients")
        .then((r) => r.json())
        .then(setClients);
    }
  }, [user]);

  const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string)?.trim();
    const password = (formData.get("password") as string)?.trim();
    const name = (formData.get("name") as string)?.trim();
    const company = (formData.get("company") as string)?.trim();

    if (!email || !password || !name || !company) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      alert("Adresse email invalide.");
      return;
    }

    if (password.length < 6) {
      alert("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, company }),
    });
    fetch("/api/clients")
      .then((r) => r.json())
      .then(setClients);
    e.currentTarget.reset();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500">
                {user?.type === "partner"
                  ? "Compte Partenaire"
                  : "Compte Client"}
              </p>
            </div>
          </div>
          <Button
            onClick={() => signOut({ callbackUrl: "/login" })}
            variant="outline"
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Informations utilisateur */}
        <Card className="p-6 mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <div className="flex items-start gap-4">
            <div className="bg-blue-600 rounded-full p-3">
              <User className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                {user?.name || "Utilisateur"}
              </h2>
              <p className="text-gray-600 mb-3">{user?.email}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Type de compte
                  </p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {user?.type === "partner" ? "Partenaire" : "Client Final"}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    ID Utilisateur
                  </p>
                  <p className="text-lg font-semibold text-gray-900 mt-1 truncate">
                    {user?.id?.slice(0, 12)}...
                  </p>
                </div>
                {user?.type === "partner" && (
                  <div className="bg-white rounded-lg p-3 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      Clients actifs
                    </p>
                    <p className="text-lg font-semibold text-gray-900 mt-1">
                      {clients.length}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Grille principale */}
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          {/* Upload */}
          <a href="/" className="block">
            <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
              <div className="flex items-center gap-3 mb-4">
                <Upload className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold">Upload de fichier</h2>
              </div>
              <p className="text-gray-600">Aller à l'interface d'upload</p>
            </Card>
          </a>

          {/* Stats partenaire */}
          {user?.type === "partner" && (
            <Card className="p-6 bg-gradient-to-br from-blue-500 to-indigo-600 text-white hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-2">
                <Users className="h-6 w-6" />
                <h2 className="text-xl font-semibold">Statistiques</h2>
              </div>
              <p className="text-5xl font-bold mt-4">{clients.length}</p>
              <p className="text-blue-100 mt-2">Entreprises créées</p>
            </Card>
          )}
        </div>

        {/* Formulaire ajout client (partenaire uniquement) */}
        {user?.type === "partner" && (
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              Ajouter un client
            </h2>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Input name="email" type="email" placeholder="Email" required />
                <Input
                  name="password"
                  type="password"
                  placeholder="Mot de passe"
                  required
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Input name="name" placeholder="Nom complet" required />
                <Input name="company" placeholder="Entreprise" required />
              </div>
              <Button type="submit" className="w-full">
                Ajouter le client
              </Button>
            </form>

            {/* Liste des clients */}
            {clients.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-3">
                  Clients existants ({clients.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {clients.map((client) => (
                    <div
                      key={client.id}
                      className="p-3 bg-gray-50 rounded-lg flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-gray-600">{client.email}</p>
                      </div>
                      <p className="text-sm text-gray-500">{client.company}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
