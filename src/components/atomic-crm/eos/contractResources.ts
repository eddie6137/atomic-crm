import {
  ContractCreate,
  ContractEdit,
  ContractList,
  ObligationCreate,
  ObligationEdit,
  ObligationList,
} from "./EosContracts";

export const eosContracts = {
  list: ContractList,
  create: ContractCreate,
  edit: ContractEdit,
  recordRepresentation: "title",
  options: { label: "EOS Contracts" },
};
export const eosContractObligations = {
  list: ObligationList,
  create: ObligationCreate,
  edit: ObligationEdit,
  recordRepresentation: "title",
  options: { label: "EOS Contract clauses" },
};
