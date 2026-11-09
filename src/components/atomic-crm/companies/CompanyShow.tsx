import { CompanyActionsRollup, CompanyEosTab } from "../eos/CompanyEosTab";
import { ClientActionsView } from "../eos/ClientActionsView";
import { COMPANY_ACTIONS_TAB, companyTabPath } from "../eos/clientActions";
import { RelationshipBadge } from "./CompanyRelationship";
import { ReferenceManyField } from "@/components/admin/reference-many-field";
import { SortButton } from "@/components/admin/sort-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus } from "lucide-react";
import {
  RecordContextProvider,
  ShowBase,
  useListContext,
  useLocaleState,
  useRecordContext,
  useShowContext,
  useTranslate,
} from "ra-core";
import {
  Link,
  Link as RouterLink,
  useLocation,
  useMatch,
  useNavigate,
} from "react-router";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ActivityLog } from "../activity/ActivityLog";
import { Avatar } from "../contacts/Avatar";
import { TagsList } from "../contacts/TagsList";
import {
  formatDealAmount,
  findDealLabel,
  formatDealCategories,
} from "../deals/dealUtils";
import { MobileContent } from "../layout/MobileContent";
import MobileHeader from "../layout/MobileHeader";
import { MobileBackButton } from "../misc/MobileBackButton";
import { formatRelativeDate } from "../misc/RelativeDate";
import { Status } from "../misc/Status";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Company, Contact, Deal } from "../types";
import {
  AdditionalInfo,
  AddressInfo,
  CompanyAside,
  CompanyInfo,
  ContextInfo,
} from "./CompanyAside";
import { CompanyAvatar } from "./CompanyAvatar";

export const CompanyShow = () => {
  const isMobile = useIsMobile();

  return (
    <ShowBase>
      {isMobile ? <CompanyShowContentMobile /> : <CompanyShowContent />}
    </ShowBase>
  );
};

const CompanyShowContentMobile = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Company>();
  // U3: the phone layout has no tab strip; /show/actions renders the account's
  // Client Actions (list/board/drawer) under the header instead of the info cards.
  const actionsMatch = useMatch(`/companies/:id/show/${COMPANY_ACTIONS_TAB}`);
  if (isPending || !record) return null;

  return (
    <>
      <MobileHeader>
        <MobileBackButton to="/" />
        <div className="flex flex-1">
          <Link to="/">
            <h1 className="text-xl font-semibold">
              {translate("resources.companies.forcedCaseName")}
            </h1>
          </Link>
        </div>
      </MobileHeader>

      <MobileContent>
        <div className="mb-6">
          <div className="flex items-center mb-4">
            <CompanyAvatar />
            <div className="mx-3 flex-1">
              <h2 className="text-2xl font-bold">{record.name}</h2>
            </div>
          </div>
        </div>
        {actionsMatch ? (
          <div
            className="pb-[calc(5rem+env(safe-area-inset-bottom))]"
            data-testid="company-actions-tab"
          >
            <Link
              to={`/companies/${record.id}/show`}
              className="text-sm underline inline-flex items-center min-h-11 mb-1"
              data-testid="company-actions-back"
            >
              Back to account
            </Link>
            <ClientActionsView lockedCompanyId={record.id} />
          </div>
        ) : (
          <>
            <div className="mb-6">
              <CompanyActionsRollup companyId={record.id} />
            </div>
            <CompanyInfo record={record} />
            <AddressInfo record={record} />
            <ContextInfo record={record} />
            <AdditionalInfo record={record} />
          </>
        )}
      </MobileContent>
    </>
  );
};

const CompanyShowContent = () => {
  const translate = useTranslate();
  const { record, isPending } = useShowContext<Company>();
  const navigate = useNavigate();

  // Get tab from URL or default to "activity"
  const tabMatch = useMatch("/companies/:id/show/:tab");
  const currentTab = tabMatch?.params?.tab || "activity";

  const handleTabChange = (value: string) => {
    if (value === currentTab || record?.id == null) return;
    // U3 (Q5): the target path has no query, so leaving Actions strips item/view/highlight.
    navigate(companyTabPath(record.id, value));
  };

  if (isPending || !record) return null;

  return (
    <div className="mt-2 flex pb-2 gap-8">
      <div className="flex-1">
        <Card>
          <CardContent>
            <div className="flex mb-3">
              <CompanyAvatar />
              <h5 className="text-xl font-semibold ml-2 flex-1">
                {record.name}
              </h5>
              <RelationshipBadge
                value={record.relationship}
                className="self-center"
              />
            </div>
            <Tabs value={currentTab} onValueChange={handleTabChange}>
              {/* U3: 4 or 5 tabs (Deals is conditional); scroll instead of a fixed grid. */}
              <TabsList
                className="w-full justify-start overflow-x-auto"
                data-testid="company-tabs"
              >
                <TabsTrigger value="activity">
                  {translate("crm.common.activity")}
                </TabsTrigger>
                <TabsTrigger value="contacts">
                  {record.nb_contacts === 0
                    ? translate("resources.companies.no_contacts")
                    : translate("resources.companies.nb_contacts", {
                        smart_count: record.nb_contacts ?? 0,
                      })}
                </TabsTrigger>
                {record.nb_deals ? (
                  <TabsTrigger value="deals">
                    {translate("resources.companies.nb_deals", {
                      smart_count: record.nb_deals ?? 0,
                    })}
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="eos">EOS</TabsTrigger>
                <TabsTrigger
                  value={COMPANY_ACTIONS_TAB}
                  data-testid="company-tab-actions"
                >
                  Actions
                </TabsTrigger>
              </TabsList>
              <TabsContent value="activity" className="pt-2">
                <ActivityLog companyId={record.id} context="company" />
              </TabsContent>
              <TabsContent value="contacts">
                {record.nb_contacts ? (
                  <ReferenceManyField
                    reference="contacts_summary"
                    target="company_id"
                    sort={{ field: "last_name", order: "ASC" }}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-row justify-end space-x-2 mt-1">
                        {!!record.nb_contacts && (
                          <SortButton
                            fields={["last_name", "first_name", "last_seen"]}
                          />
                        )}
                        <CreateRelatedContactButton />
                      </div>
                      <ContactsIterator />
                    </div>
                  </ReferenceManyField>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-row justify-end space-x-2 mt-1">
                      <CreateRelatedContactButton />
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="deals">
                {record.nb_deals ? (
                  <ReferenceManyField
                    reference="deals"
                    target="company_id"
                    sort={{ field: "name", order: "ASC" }}
                  >
                    <DealsIterator />
                  </ReferenceManyField>
                ) : null}
              </TabsContent>
              <TabsContent value="eos">
                <CompanyEosTab companyId={record.id} />
              </TabsContent>
              <TabsContent
                value={COMPANY_ACTIONS_TAB}
                className="pt-2 min-w-0"
                data-testid="company-actions-tab"
              >
                <ClientActionsView lockedCompanyId={record.id} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <CompanyAside />
    </div>
  );
};

const ContactsIterator = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const location = useLocation();
  const { data: contacts, error, isPending } = useListContext<Contact>();

  if (isPending || error) return null;

  return (
    <div className="pt-0">
      {contacts.map((contact) => (
        <RecordContextProvider key={contact.id} value={contact}>
          <div className="p-0 text-sm">
            <RouterLink
              to={`/contacts/${contact.id}/show`}
              state={{ from: location.pathname }}
              className="flex items-center justify-between hover:bg-muted py-2 transition-colors"
            >
              <div className="mr-4">
                <Avatar />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {`${contact.first_name} ${contact.last_name}`}
                </div>
                <div className="text-sm text-muted-foreground">
                  {contact.title}
                  {contact.nb_tasks
                    ? ` - ${translate("crm.common.task_count", {
                        smart_count: contact.nb_tasks ?? 0,
                      })}`
                    : ""}
                  &nbsp; &nbsp;
                  <TagsList />
                </div>
              </div>
              {contact.last_seen && (
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    {translate("crm.common.last_activity_with_date", {
                      date: formatRelativeDate(contact.last_seen, locale),
                    })}{" "}
                    <Status status={contact.status} />
                  </div>
                </div>
              )}
            </RouterLink>
          </div>
        </RecordContextProvider>
      ))}
    </div>
  );
};

const CreateRelatedContactButton = () => {
  const translate = useTranslate();
  const company = useRecordContext<Company>();
  return (
    <RouterLink
      to="/contacts/create"
      state={company ? { record: { company_id: company.id } } : undefined}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "h-9 flex items-center gap-2",
      )}
    >
      <UserPlus className="h-4 w-4" />
      {translate("resources.contacts.action.add")}
    </RouterLink>
  );
};

const DealsIterator = () => {
  const translate = useTranslate();
  const [locale = "en"] = useLocaleState();
  const { data: deals, error, isPending } = useListContext<Deal>();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  if (isPending || error) return null;
  return (
    <div>
      <div>
        {deals.map((deal) => (
          <div key={deal.id} className="p-0 text-sm">
            <RouterLink
              to={`/deals/${deal.id}/show`}
              className="flex items-center justify-between hover:bg-muted py-2 px-4 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{deal.name}</div>
                <div className="text-sm text-muted-foreground">
                  {findDealLabel(dealStages, deal.stage)},{" "}
                  {formatDealAmount(deal.amount, currency)}
                  {deal.categories?.length
                    ? `, ${formatDealCategories(dealCategories, deal.categories)}`
                    : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  {translate("crm.common.last_activity_with_date", {
                    date: formatRelativeDate(deal.updated_at, locale),
                  })}{" "}
                </div>
              </div>
            </RouterLink>
          </div>
        ))}
      </div>
    </div>
  );
};
