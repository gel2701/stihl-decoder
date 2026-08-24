# 🚀 STIHL Machine & Serienummer Decoder Tool

Een moderne, responsieve webapplicatie waarmee gebruikers op basis van een STIHL serienummer (9 cijfers) of gietnummer/onderdeelnummer (11 cijfers) direct het productieland, de fabriek, de geschatte bouwperiode, de modelgroep en de gietklok (Gussuhr) specificaties opvragen.

---

## 💻 Hoe zet u deze applicatie binnen 5 minuten GRATIS live op internet?

Volg onderstaande 3 eenvoudige stappen om de tool op **Render.com** (of Vercel) en op uw eigen domeinnaam live te zetten.

---

### STAP 1: Maak een GitHub Repository aan
1. Ga naar [GitHub.com](https://github.com) en log in (of maak een gratis account aan).
2. Klik rechtsboven op de **+** $\rightarrow$ **New repository**.
3. Noem de repository bijvoorbeeld `stihl-decoder` en klik op **Create repository**.
4. Upload de bestanden uit deze projectmap (`stihl-decoder`) naar uw nieuwe GitHub repository.

---

### STAP 2: Zet de app gratis live op Render.com
1. Ga naar [Render.com](https://render.com) en log in met uw GitHub-account.
2. Klik op de knop **New +** $\rightarrow$ **Web Service**.
3. Kies **Build and deploy from a Git repository** en selecteer uw `stihl-decoder` repository.
4. Vul het volgende in (meestal herkent Render dit automatisch via ons `render.yaml` bestand):
   - **Name:** `stihl-decoder`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
5. Klik onderaan op **Create Web Service**.

> 🎉 **Gefeliciteerd!** Binnen 1-2 minuten staat uw site live op een gratis webadres zoals `https://stihl-decoder.onrender.com`.

---

### STAP 3: Uw eigen domeinnaam koppelen (bijv. `stihldecoder.nl`)
1. Koop uw domeinnaam bij een provider zoals **TransIP.nl** of **Mijndomein.nl**.
2. Ga in Render.com naar uw web service $\rightarrow$ **Settings** $\rightarrow$ **Custom Domains** $\rightarrow$ klik op **Add Custom Domain** en vul uw domeinnaam in (bijv. `stihldecoder.nl`).
3. Render geeft u twee DNS-records om in te vullen in het beheerpaneel van TransIP/Mijndomein:
   - **A-record** $\rightarrow$ wijzen naar het IP-adres van Render.
   - **CNAME-record** (`www`) $\rightarrow$ wijzen naar `stihl-decoder.onrender.com`.
4. Binnen 10 minuten is uw eigen domein live inclusief gratis **HTTPS (groen slotje)**!

---

## 🛠️ Lokaal testen op uw computer

Wilt u de app lokaal testen op uw eigen PC?

```bash
# 1. Installeer dependencies
npm install

# 2. Voer de unit-tests uit
npm test

# 3. Start de lokale server
npm start
```

Open vervolgens uw browser op [http://localhost:3000](http://localhost:3000).
