# Audyt CRM SaaS — 5 listopada 2026

GuGu ma sensowny zakres dla salonu: terminarz, klienci, usługi, zespół, zasoby, raporty i wynagrodzenia składają się na rzeczywisty produkt SaaS. Największym problemem nie był brak kolejnych modułów, lecz utrata czytelności na telefonie, mylące stany błędów oraz operacje, które mogły zniszczyć konfigurację lub zgubić pracę użytkownika. W tym audycie poprawiono te konkretne problemy i sprawdzono je na działającym lokalnym API.

Nie oznaczamy aplikacji jako w pełni „idiotoodpornej”: natywny iOS/Android, pełne limity kliknięć i kilka braków produktowych wymagają dalszej pracy. Lista poniżej rozdziela gotowe poprawki od tych ograniczeń.

## Organizacja i zakres

- Punkt wyjścia: wcześniejsze zmiany użytkownika zapisane osobno w commicie `e935949` na `agent/codex/crm-saas-audit`.
- Agent główny: audyt desktopowy 1440×1000, wszystkie 11 pozycji panelu, przejścia klientów, błędy, dashboard, agregacja i testy końcowe.
- Agent mobile: 12 tras, w tym setup, Pixel/Chromium 412 px i iPhone/WebKit 390 px; szczegółowe interakcje 360 px, vi/en, jasny/ciemny motyw.
- Specjalista CRM: kontrakty/API, bezpieczeństwo zmian danych, ustawienia i grafiki.
- Specjalista eksportów: prawdziwe pliki iOS/Android oraz dodatkowy przegląd UI/lokalizacji.
- Izolowane środowisko: API `3470`, web `8470`, baza `gugu_crm_audit`, Redis DB 12. Test integracyjny profilu na osobnej `gugu_crm_function_test`, Redis DB 11. Nie resetowano baz deweloperskich.
- Wiadomości trafiały do lokalnego Mailpit. Nie wysyłano komunikacji do klientów ani prawdziwych providerów Zalo/AI.

## Ocena funkcji i intuicyjności

**Codzienna praca:** Today, kalendarz i klienci są właściwym rdzeniem. Szybki dostęp do wizyt na telefonie jest ważniejszy od dodatkowych statystyk; dlatego kolejkę przesunięto wyżej, a atrapy wskaźników usunięto. Obliczanie dostępności pozostało w backendzie.

**Konfiguracja salonu:** usługi, personel i godziny mają praktyczne znaczenie. Opcjonalne zasoby powinny pozostać opcjonalne. Telefon i adres nie mogą blokować poprawienia nazwy salonu po rejestracji e-mailem — poprawiono UI, kontrakt i API.

**Finanse:** istniejące prognozy i payroll są przydatne, ale wymagają czytelnego rozróżnienia szacunków i zapisów salonu. Nie dodawano procesowania płatności klientów. Raporty nadal mogą być uproszczone: dziesięć równorzędnych wskaźników to za dużo na pierwszy ekran.

**Mobile:** brak poziomego przewijania nie wystarcza jako kryterium jakości. Przed poprawką nazwa usługi mieściła jedną literę, bo pozostałą szerokość zajmowały akcje. Testy teraz mierzą także realną czytelność nazw i wielkość kontrolek.

## Wspólny rejestr napraw

| ID | Priorytet | Problem przed audytem | Wynik |
| --- | --- | --- | --- |
| A01 | P1 | Nazwy usług ucinane nawet do jednej litery na telefonie | Czytelne karty mobile, osobny wiersz akcji; desktop zachowuje tabelaryczny układ |
| A02 | P1 | Ściśnięta tożsamość klienta/usługi w agendzie i historii | Układ mobile zawija i rozdziela dane zamiast ściskać nazwę |
| A03 | P1 | Wyszukiwanie w nagłówku ignorowane przez ekran klientów | `?q=` jest odczytywane; opis mówi uczciwie o klientach, nazwie i telefonie |
| A04 | P1 | Brak dostępu do klientów po pierwszych 50 | Stronicowane pobieranie i „Wczytaj więcej”; test z 53 profilami |
| A05 | P1 | Awaria API udawała brak klientów/wizyt/personelu lub pusty ekran | Jawny błąd i ponowienie; zachowanie dostępnych danych przy błędzie odświeżenia |
| A06 | P1 | Brak poprawienia nazwy klienta; błędy zapisu e-maila niewidoczne | Edycja nazwy przez istniejące API, widoczny błąd i blokada powtórnego zapisu |
| A07 | P1 | Usunięcie notatki, pracownika lub zasobu jednym dotknięciem | Potwierdzenia; anulowanie nie usuwa danych; zapis blokuje zamknięcie |
| A08 | P1 | Ponowienie dodawania zasobu tworzyło kolejny typ | Ponawiany jest tylko nieudany drugi krok, z zachowanym ID typu |
| A09 | P1 | Zapis grafiku usuwał dzielone zmiany i dodatkowe przerwy | Pełne dane są zachowane; uproszczenie zmiany jest świadomą akcją |
| A10 | P1 | Zapis ustawień kasował inne niezapisane sekcje | Formularze nie remountują się po każdym odświeżeniu danych |
| A11 | P1 | Telefon/adres blokowały zmianę samej nazwy salonu | Opcjonalność działa przez cały przepływ UI–kontrakt–API; testy uprawnień i tenantów |
| A12 | P1 | Natywny eksport XLSX udostępniał samą nazwę pliku | Zapis rzeczywistych bajtów i systemowe udostępnianie pliku; obsługa błędu |
| A13 | P1 | Select otwierał kolejny modal w formularzu | Wybór inline, poprawny fokus i Escape bez zamykania edytora |
| A14 | P2 | Kontrolki 28–42 px, pola tekstowe 15 px | Wspólne pola 16 px/minimum44; większe przyciski kalendarza, terminów i powiadomień |
| A15 | P2 | Stopka formularza nie mieściła długich etykiet; brak unikania klawiatury | Zawijanie stopki, native KeyboardAvoidingView; urządzeniowy test jeszcze wymagany |
| A16 | P2 | Pusta wyszukiwarka mówiła, że salon nie ma klientów | Osobny stan „brak dopasowań” i wyczyszczenie filtrów |
| A17 | P2 | Pusty formularz pozwalał klikać Save bez rezultatu | Nieaktywne przyciski dla pustych danych i podczas zapisu, limity długości pól |
| A18 | P2 | Today sugerował uzupełnienie danych dla niepodłączonych KPI | Ukryte niezaimplementowane KPI; kolejka wizyt wyżej w mobile |

## Weryfikacja

- **Pełne `pnpm verify`: 21/21 zadań zakończonych sukcesem**, formatowanie, granice pakietów, skan sekretów, kontrola agentów, lint, typecheck i testy. Pozostały ostrzeżenia złożoności/długości plików, bez błędów lintowania.

- Produkcyjny Expo web export zbudowany i uruchomiony lokalnie.
- **12/12 Playwright** w Chromium i WebKit: `crm-usability`, `mobile-usability`, `function-audit`, `flexible-booking`, `payroll`. Nowe ścieżki klientów, mobile i ustawień obejmują vi/en; istniejąca regresja payroll ma swój dotychczasowy zakres.
- **38/38 testów aplikacji**, w tym 8 przypadków eksportów natywnych i 3 przypadki zachowania złożonych grafików.
- **15/15 testów lokalizacji** i **3/3 testów kontraktu profilu**.
- **1 integracyjny test profilu** na rzeczywistym Postgres/Redis: zapis nazwy, zachowanie/wyczyszczenie kontaktów, błędny telefon/adres, odmowa dla staff i 404 dla innego salonu.
- Rzeczywiste pobrania CSV (455 bajtów) i XLSX (2063 bajty, sygnatura ZIP) w obu przeglądarkach; desktopowe wyszukiwanie klawiaturą w ciemnym motywie i historia klienta bez ucięcia tekstu na 360 px.
- Dodatkowa macierz mobile: 4 kombinacje silnik × język przy 360 px; błędy API i ponowienie, motyw, czytelność, pola dotykowe i zachowanie Escape.
- Audyt desktopu przed/po: 11 ekranów, bez błędów strony i poziomego przepełnienia w zapisanych przebiegach. To nie dowodzi poprawności każdej możliwej akcji.
- Raport uruchomienia Playwright: `reports/crm-audit-e2e.json`; zrzuty i obserwacje w tym katalogu. Końcowe kontrole pobrań/historii są zapisane w `final-checks.json`.

Podczas pracy testy wychwyciły konflikt kluczy React w nowym edytorze nazwy — naprawiony przed zieloną regresją. Bundler deweloperski miał przejściowy błąd SSR po zmianie zależności; końcowe wyniki pochodzą z osobnego produkcyjnego exportu. Pierwszy `pnpm verify` trafił na sandboxowe `listen EPERM`; testy wymagające portów uruchomiono ponownie z dostępem do lokalnych serwerów. Istniejąca wspólna baza integracyjna miała wcześniej nieudaną migrację P3009; zamiast ją resetować, użyto nowej bazy testowej.

## Priorytety dalszej pracy

| Priorytet | Co pozostaje | Warunek zamknięcia |
| --- | --- | --- |
| P1 | Natywny iPhone i Android: klawiatura, Back, safe areas, udostępnianie, VoiceOver/TalkBack | Zgodny build SDK 58 i te same ścieżki na urządzeniach; obecny Expo Go ma SDK 54, Android SDK nie jest zainstalowane |
| P2 | Walk-in ≤3 dotknięcia, check-in ≤2, szybka rezerwacja ≤15 s | Zmierzone ścieżki z salonowym personelem; obecny walk-in wymaga większej liczby decyzji i nie spełnia udowodnionego limitu |
| P2 | Poprawienie telefonu klienta i łączenie duplikatów | Backendowa polityka tożsamości/historii + audit trail + testy; samo pole tekstowe byłoby niewystarczające |
| P2 | Pełny edytor wielu zmian i przerw; spójne wybieranie dat urlopów/świąt | Dodawanie wielu przedziałów bez konwersji do jednej zmiany; bezpieczne usuwanie wyjątków |
| P2 | Pełny tryb offline | Trwały cache, czytelny czas aktualizacji i blokowanie zapisów; obecnie zachowywany jest dostępny cache w sesji |
| P2 | Uproszczenie Insights i uprawnień ekranów otwieranych linkiem | Maksymalnie cztery główne liczby; jasny brak dostępu zamiast np. pending na ręcznie otwartym Team dla staff |
| P2 | Szersze wyszukiwanie | Osobno zaprojektowane wyniki klientów/wizyt/usług, bez obiecywania ich jednym niedziałającym polem |

Powyższe pozycje nie są oznaczone jako gotowe. AI import i Zalo sprawdzono lokalnie w stanach dostępności/odłączenia; realne zachowanie providerów nie jest potwierdzone.

## Raporty szczegółowe

- [Mobile](mobile.md)
- [Funkcje, kontrakty i backend](function-review.md)
- [Eksporty natywne](native-exports.md)
- [Końcowy przegląd designu i lokalizacji — approve](design-localization-review.md)
- Przykłady przed/po: `desktop-today.png`, `desktop-after-today.png`, `mobile/chromium-before-services.png`, `mobile/chromium-after-services.png`.
