import {mergeSameHousehold, readAllHouseholds, canonicalizeHouseholdNames, writeAllHouseholds} from "./households.js";

async function driver() {
    const rows = await readAllHouseholds('local/household-accounts.csv')
    await canonicalizeHouseholdNames(rows)
    const households = await mergeSameHousehold(rows)
    await writeAllHouseholds(households, 'local/household-contact-import.csv')
}

driver()
    .then(() => console.log("Import processed, output ready."))
