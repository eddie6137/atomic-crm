import { EditBase, Form, usePermissions } from "ra-core";
import { Card, CardContent } from "@/components/ui/card";

import { CompanyInputs } from "./CompanyInputs";
import { CompanyAside } from "./CompanyAside";
import { stripAttributionUnlessAdmin } from "./attribution";
import { FormToolbar } from "../layout/FormToolbar";

export const CompanyEdit = () => {
  const { permissions } = usePermissions();
  return (
    <EditBase
      actions={false}
      redirect="show"
      transform={(values) => {
        // add https:// before website if not present
        if (values.website && !values.website.startsWith("http")) {
          values.website = `https://${values.website}`;
        }
        return stripAttributionUnlessAdmin(values, permissions);
      }}
    >
      <div className="mt-2 flex gap-8">
        <Form className="flex flex-1 flex-col gap-4 pb-2">
          <Card>
            <CardContent>
              <CompanyInputs />
              <FormToolbar />
            </CardContent>
          </Card>
        </Form>

        <CompanyAside link="show" />
      </div>
    </EditBase>
  );
};
